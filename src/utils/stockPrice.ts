/**
 * 股票報價工具
 * - 美股：Yahoo Finance 非官方 API（30 分鐘延遲，免費，不需 API key）
 * - 台股：TWSE 官方 API（收盤價）
 *
 * 快取策略：30 分鐘內不重新抓取（寫入 SQLite stock_prices_cache）
 */
import { Platform } from 'react-native';
import { getStockPriceCache, setStockPriceCache } from './storage';
import type { StockPriceCache } from '../types';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 分鐘

/** 判斷快取是否仍有效 */
function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < CACHE_TTL_MS;
}

/**
 * 輔助函數：處理 Web CORS 的 fetch
 */
async function fetchWithCORS(url: string, headers?: any): Promise<Response> {
  if (Platform.OS === 'web') {
    // Web 使用 allorigins 代理解決 CORS
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Fetch failed');
    const json = await res.json();
    return {
      ok: true,
      json: async () => JSON.parse(json.contents),
    } as Response;
  }
  return fetch(url, headers);
}

/**
 * 抓取美股報價（Yahoo Finance 非官方端點）
 * 回傳 USD 現價，失敗時回傳 null
 */
async function fetchUSStockPrice(ticker: string): Promise<number | null> {
  try {
    const originalUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    // Web 不允許手動設 User-Agent，Native 則建議帶上以免被擋
    const headers = Platform.OS === 'web' ? {} : { headers: { 'User-Agent': 'Mozilla/5.0' } };
    const res = await fetchWithCORS(originalUrl, headers);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price: number | undefined =
      meta?.regularMarketPrice ?? meta?.chartPreviousClose;
    return price != null ? price : null;
  } catch (err) {
    console.error('fetchUSStockPrice error:', err);
    return null;
  }
}

/**
 * 抓取台股收盤價（TWSE 官方 API）
 * 回傳 TWD 現價，失敗時回傳 null
 */
async function fetchTWStockPrice(stockNo: string): Promise<number | null> {
  const getDailyPrice = async (date: Date): Promise<number | null> => {
    try {
      const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const originalUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${encodeURIComponent(stockNo)}&date=${yyyymmdd}&response=json`;
      const res = await fetchWithCORS(originalUrl);
      const json = await res.json();
      const rows: string[][] = json?.data ?? [];
      if (rows.length === 0) return null;
      const lastRow = rows[rows.length - 1];
      const closeStr = lastRow[6]?.replace(/,/g, '');
      const close = parseFloat(closeStr);
      return isNaN(close) ? null : close;
    } catch {
      return null;
    }
  };

  // 1. Try current month
  let price = await getDailyPrice(new Date());
  if (price != null) return price;

  // 2. If empty (maybe beginning of month), try previous month
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  price = await getDailyPrice(lastMonth);
  return price;
}

/** 取得單一股票現價（優先使用快取） */
export async function getStockPrice(
  ticker: string,
  currency: 'TWD' | 'USD',
  ignoreCache = false
): Promise<StockPriceCache | null> {
  // 1. 先查快取
  const cached = await getStockPriceCache(ticker);
  if (!ignoreCache && cached && isCacheValid(cached.lastUpdated)) {
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
  stocks: Array<{ ticker: string; currency: 'TWD' | 'USD' }>,
  ignoreCache = false
): Promise<Record<string, StockPriceCache>> {
  const results: Record<string, StockPriceCache> = {};
  await Promise.all(
    stocks.map(async ({ ticker, currency }) => {
      const result = await getStockPrice(ticker, currency, ignoreCache);
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

