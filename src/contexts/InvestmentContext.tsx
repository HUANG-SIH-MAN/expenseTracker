/**
 * InvestmentContext：投資模組全域狀態
 * - 股票交易列表
 * - 股價快取
 * - 計算後的持倉資訊
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { StockTransaction, StockPriceCache } from '../types';
import {
  getStockTransactions,
  saveStockTransaction,
  saveStockTransactions,
  deleteStockTransaction,
  deleteStockTransactionsByTicker,
  getAllStockPricesCache,
} from '../utils/storage';
import { getMultipleStockPrices, getUSDTWDRate } from '../utils/stockPrice';
import { classifyInstrument, normalizeTicker } from '../utils/instrumentClassification';
import {
  calculatePositions,
  type HoldingPosition,
} from '../utils/stockCalculations';

/**
 * 依交易資料推斷幣別（避免硬編碼白名單造成台股被誤判為 USD）
 * 規則：任一筆交易有 usdCost => USD，否則 TWD
 */
function inferTickerCurrencies(
  txList: StockTransaction[],
): Record<string, 'TWD' | 'USD'> {
  const result: Record<string, 'TWD' | 'USD'> = {};
  for (const tx of txList) {
    const fallbackCurrency = tx.usdCost != null ? 'USD' : undefined;
    const classification = classifyInstrument({ ticker: tx.ticker, currency: fallbackCurrency });
    const inferred = classification.market === 'TW' ? 'TWD' : 'USD';
    const normalizedTicker = normalizeTicker(tx.ticker);
    const existing = result[normalizedTicker];
    if (existing == null || inferred === 'USD') {
      result[normalizedTicker] = inferred;
    }
  }
  return result;
}

interface InvestmentContextValue {
  transactions: StockTransaction[];
  prices: Record<string, StockPriceCache>;
  positions: Map<string, HoldingPosition>;
  usdTwdRate: number;
  isLoading: boolean;
  isRefreshingPrices: boolean;
  reload: (andRefreshPrices?: boolean) => Promise<void>;
  refreshPrices: (ignoreCache?: boolean, txList?: StockTransaction[]) => Promise<void>;
  addTransaction: (tx: StockTransaction) => Promise<void>;
  updateTransaction: (tx: StockTransaction) => Promise<void>;
  importTransactions: (txs: StockTransaction[]) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  removeAllTransactionsByTicker: (ticker: string) => Promise<void>;
}

const InvestmentContext = createContext<InvestmentContextValue | null>(null);

const DEFAULT_USDTWD = 32.0;

export function InvestmentProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [prices, setPrices] = useState<Record<string, StockPriceCache>>({});
  const [positions, setPositions] = useState<Map<string, HoldingPosition>>(new Map());
  const [usdTwdRate, setUsdTwdRate] = useState<number>(DEFAULT_USDTWD);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // 使用 Ref 追蹤最新交易列表，避免 callback 因 transactions 變動而變動導致無限循環
  const transactionsRef = useRef<StockTransaction[]>(transactions);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  const refreshPrices = useCallback(async (ignoreCache = false, txList?: StockTransaction[]) => {
    setIsRefreshingPrices(true);
    try {
      const targetTxs = txList || transactionsRef.current;
      const tickerCurrencies = inferTickerCurrencies(targetTxs);
      const tickers = Array.from(new Set(targetTxs.map(t => normalizeTicker(t.ticker))));
      if (tickers.length === 0) return;

      const stocksToFetch = tickers.map(ticker => ({
        ticker,
        currency: tickerCurrencies[ticker] ?? 'TWD',
      }));
      stocksToFetch.push({ ticker: 'USDTWD=X', currency: 'USD' });

      const newPrices = await getMultipleStockPrices(stocksToFetch, ignoreCache);
      const rate = await getUSDTWDRate();

      if (!mountedRef.current) return;
      setPrices(prev => ({ ...prev, ...newPrices }));
      if (rate != null) setUsdTwdRate(rate);
    } finally {
      if (mountedRef.current) setIsRefreshingPrices(false);
    }
  }, []); // 不依賴 transactions

  const reload = useCallback(async (andRefreshPrices = false) => {
    setIsLoading(true);
    try {
      const [txs, cachedPrices] = await Promise.all([
        getStockTransactions(),
        getAllStockPricesCache(),
      ]);
      if (!mountedRef.current) return;
      setTransactions(txs);
      const priceMap: Record<string, StockPriceCache> = {};
      for (const p of cachedPrices) priceMap[p.ticker] = p;
      setPrices(priceMap);
      setPositions(calculatePositions(txs));

      if (andRefreshPrices) {
        // 直接傳入剛抓到的 txs
        refreshPrices(false, txs);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [refreshPrices]);

  const addTransaction = useCallback(async (tx: StockTransaction) => {
    await saveStockTransaction(tx);
    setTransactions(prev => {
      const updated = [...prev, tx].sort((a, b) => a.date.localeCompare(b.date));
      setPositions(calculatePositions(updated));
      // 異步刷新
      refreshPrices(true, updated);
      return updated;
    });
  }, [refreshPrices]);

  const updateTransaction = useCallback(async (tx: StockTransaction) => {
    await saveStockTransaction(tx);
    setTransactions(prev => {
      const updated = prev.map(t => (t.id === tx.id ? tx : t)).sort((a, b) => a.date.localeCompare(b.date));
      setPositions(calculatePositions(updated));
      refreshPrices(true, updated);
      return updated;
    });
  }, [refreshPrices]);

  const importTransactions = useCallback(async (txs: StockTransaction[]) => {
    await saveStockTransactions(txs);
    setTransactions(prev => {
      const updated = [...prev, ...txs].sort((a, b) => a.date.localeCompare(b.date));
      setPositions(calculatePositions(updated));
      refreshPrices(true, updated);
      return updated;
    });
  }, [refreshPrices]);

  const removeTransaction = useCallback(async (id: string) => {
    await deleteStockTransaction(id);
    setTransactions(prev => {
      const updated = prev.filter(t => t.id !== id);
      setPositions(calculatePositions(updated));
      return updated;
    });
  }, []);

  const removeAllTransactionsByTicker = useCallback(async (ticker: string) => {
    await deleteStockTransactionsByTicker(ticker);
    setTransactions(prev => {
      const updated = prev.filter(t => t.ticker !== ticker);
      setPositions(calculatePositions(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    reload(true);
  }, [reload]);

  return (
    <InvestmentContext.Provider
      value={{
        transactions,
        prices,
        positions,
        usdTwdRate,
        isLoading,
        isRefreshingPrices,
        reload,
        refreshPrices,
        addTransaction,
        updateTransaction,
        importTransactions,
        removeTransaction,
        removeAllTransactionsByTicker,
      }}
    >
      {children}
    </InvestmentContext.Provider>
  );
}

export function useInvestment(): InvestmentContextValue {
  const ctx = useContext(InvestmentContext);
  if (!ctx) throw new Error('useInvestment must be used within InvestmentProvider');
  return ctx;
}

/** 計算某標的的現價（台幣換算） */
export function getPriceTWD(
  ticker: string,
  prices: Record<string, StockPriceCache>,
  usdTwdRate: number
): number {
  const cache = prices[ticker];
  if (!cache) return 0;
  if (cache.currency === 'TWD') return cache.price;
  return cache.price * usdTwdRate;
}
