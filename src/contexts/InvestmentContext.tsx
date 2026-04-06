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
  getAllStockPricesCache,
} from '../utils/storage';
import { getMultipleStockPrices, getUSDTWDRate } from '../utils/stockPrice';
import {
  calculatePositions,
  type HoldingPosition,
} from '../utils/stockCalculations';

/** 股票幣別定義（決定使用哪個報價 API） */
const STOCK_CURRENCIES: Record<string, 'TWD' | 'USD'> = {
  '006208': 'TWD',
  NVDA: 'USD',
  QQQ: 'USD',
  SMH: 'USD',
  GLD: 'USD',
  IBIT: 'USD',
  ARKK: 'USD',
};

interface InvestmentContextValue {
  transactions: StockTransaction[];
  prices: Record<string, StockPriceCache>;
  positions: Map<string, HoldingPosition>;
  usdTwdRate: number;
  isLoading: boolean;
  isRefreshingPrices: boolean;
  reload: () => Promise<void>;
  refreshPrices: () => Promise<void>;
  addTransaction: (tx: StockTransaction) => Promise<void>;
  importTransactions: (txs: StockTransaction[]) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
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

  const reload = useCallback(async () => {
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
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    setIsRefreshingPrices(true);
    try {
      // 只抓有持倉的股票
      const tickers = Array.from(
        new Set(transactions.map(t => t.ticker))
      );
      const stocksToFetch = tickers.map(ticker => ({
        ticker,
        currency: STOCK_CURRENCIES[ticker] ?? 'USD',
      }));
      // 加入 USDTWD 匯率
      stocksToFetch.push({ ticker: 'USDTWD=X', currency: 'USD' });

      const newPrices = await getMultipleStockPrices(stocksToFetch);
      const rate = await getUSDTWDRate();

      if (!mountedRef.current) return;
      setPrices(prev => ({ ...prev, ...newPrices }));
      if (rate != null) setUsdTwdRate(rate);
    } finally {
      if (mountedRef.current) setIsRefreshingPrices(false);
    }
  }, [transactions]);

  const addTransaction = useCallback(async (tx: StockTransaction) => {
    await saveStockTransaction(tx);
    const updated = [...transactions, tx].sort((a, b) => a.date.localeCompare(b.date));
    setTransactions(updated);
    setPositions(calculatePositions(updated));
  }, [transactions]);

  const importTransactions = useCallback(async (txs: StockTransaction[]) => {
    await saveStockTransactions(txs);
    const updated = [...transactions, ...txs].sort((a, b) => a.date.localeCompare(b.date));
    setTransactions(updated);
    setPositions(calculatePositions(updated));
  }, [transactions]);

  const removeTransaction = useCallback(async (id: string) => {
    await deleteStockTransaction(id);
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    setPositions(calculatePositions(updated));
  }, [transactions]);

  useEffect(() => {
    reload();
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
        importTransactions,
        removeTransaction,
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
