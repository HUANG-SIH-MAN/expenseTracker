/**
 * 股票報價工具
 * - 美股：Yahoo Finance 非官方 API（30 分鐘延遲，免費，不需 API key）
 * - 台股：TWSE 官方 API（收盤價）
 *
 * 快取策略：30 分鐘內不重新抓取（寫入 SQLite stock_prices_cache）
 */
import { getStockPriceCache, setStockPriceCache } from './storage';
import type { StockPriceCache } from '../types';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分鐘

/** 判斷快取是否仍有效 */
function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < CACHE_TTL_MS;
}

/**
 * 抓取美股報價（Yahoo Finance 非官方端點）
 * 回傳 USD 現價，失敗時回傳 null
 */
async function fetchUSStockPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price: number | undefined =
      meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    return price != null ? price : null;
  } catch {
    return null;
  }
}

/**
 * 抓取台股收盤價（TWSE 官方 API）
 * 回傳 TWD 現價，失敗時回傳 null
 */
async function fetchTWStockPrice(stockNo: string): Promise<number | null> {
  try {
    const today = new Date();
    const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${encodeURIComponent(stockNo)}&date=${yyyymmdd}&response=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    // 取最後一筆（最新交易日）
    const rows: string[][] = json?.data ?? [];
    if (rows.length === 0) return null;
    const lastRow = rows[rows.length - 1];
    // 欄位 6 = 收盤價（格式：'171.60' 或 '1,234.00'）
    const closeStr = lastRow[6]?.replace(/,/g, '');
    const close = parseFloat(closeStr);
    return isNaN(close) ? null : close;
  } catch {
    return null;
  }
}

/** 取得單一股票現價（優先使用快取） */
export async function getStockPrice(
  ticker: string,
  currency: 'TWD' | 'USD'
): Promise<StockPriceCache | null> {
  // 先查快取
  const cached = await getStockPriceCache(ticker);
  if (cached && isCacheValid(cached.lastUpdated)) {
    return cached;
  }

  // 重新抓取
  let price: number | null = null;
  if (currency === 'USD') {
    price = await fetchUSStockPrice(ticker);
  } else {
    price = await fetchTWStockPrice(ticker);
  }

  if (price == null) {
    // 抓取失敗，回傳舊快取（若有）
    return cached ?? null;
  }

  const cache: StockPriceCache = {
    ticker,
    price,
    currency,
    lastUpdated: new Date().toISOString(),
  };
  await setStockPriceCache(cache);
  return cache;
}

/** 批次取得多支股票現價 */
export async function getMultipleStockPrices(
  stocks: Array<{ ticker: string; currency: 'TWD' | 'USD' }>
): Promise<Record<string, StockPriceCache>> {
  const results: Record<string, StockPriceCache> = {};
  await Promise.all(
    stocks.map(async ({ ticker, currency }) => {
      const result = await getStockPrice(ticker, currency);
      if (result) {
        results[ticker] = result;
      }
    })
  );
  return results;
}

/** 取得 USD/TWD 即時匯率（用 Yahoo Finance 的 USDTWD=X） */
export async function getUSDTWDRate(): Promise<number | null> {
  const result = await getStockPrice('USDTWD=X', 'USD');
  return result?.price ?? null;
}
