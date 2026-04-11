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
 * CORS proxy 設定列表（web 平台用）
 * 依序嘗試，第一個成功即回傳
 */
const CORS_PROXIES: Array<{
  buildUrl: (target: string) => string;
  parseResponse: (res: globalThis.Response) => Promise<globalThis.Response>;
}> = [
  {
    // corsproxy.io — 直接回傳原始 response
    buildUrl: (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    parseResponse: async (res) => res,
  },
  {
    // codetabs — 直接回傳原始 response
    buildUrl: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    parseResponse: async (res) => res,
  },
  {
    // allorigins — 回傳 { contents: string }，需解包
    buildUrl: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    parseResponse: async (res) => {
      const json = await res.json();
      const contents: string = json.contents;
      return {
        ok: true,
        json: async () => JSON.parse(contents),
        text: async () => contents,
      } as globalThis.Response;
    },
  },
];

/**
 * 輔助函數：處理 Web CORS 的 fetch（依序嘗試多個 proxy）
 */
export async function fetchWithCORS(url: string, _headers?: any): Promise<globalThis.Response> {
  if (Platform.OS === 'web') {
    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = proxy.buildUrl(url);
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        return await proxy.parseResponse(res);
      } catch {
        // 這個 proxy 失敗，試下一個
      }
    }
    throw new Error('All CORS proxies failed');
  }
  return fetch(url, _headers);
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

/**
 * 抓取歷史年底收盤價（TWD）
 * - 台股：TWSE API，查該年 12 月最後一個交易日
 * - 美股：Yahoo Finance，查 12/30~1/2 區間，換算 TWD
 *
 * 快取策略：歷史價格不會變動，存入後永久有效（key = `${ticker}_${year}_ye`）
 */
export async function fetchYearEndPriceTWD(
  ticker: string,
  currency: 'TWD' | 'USD',
  year: number,
  usdTwdRate: number
): Promise<number | null> {
  const cacheKey = `${ticker}_${year}_ye`;

  // 查永久快取
  const cached = await getStockPriceCache(cacheKey);
  if (cached) return cached.price; // 歷史價格永久有效，有就直接用

  let priceTWD: number | null = null;

  if (currency === 'TWD') {
    // TWSE：查該年 12 月月底最後收盤
    try {
      const yyyymmdd = `${year}1215`; // 12 月中旬，讓 API 回傳整個 12 月
      const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${encodeURIComponent(ticker)}&date=${yyyymmdd}&response=json`;
      const res = await fetchWithCORS(url);
      const json = await res.json();
      const rows: string[][] = json?.data ?? [];
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const closeStr = lastRow[6]?.replace(/,/g, '');
        const close = parseFloat(closeStr);
        if (!isNaN(close)) priceTWD = close;
      }
    } catch {
      // ignore
    }
  } else {
    // Yahoo Finance：查該年 12/29 ~ 1/2 區間取最後一個交易日
    try {
      const period1 = Math.floor(new Date(`${year}-12-29T00:00:00Z`).getTime() / 1000);
      const period2 = Math.floor(new Date(`${year + 1}-01-03T00:00:00Z`).getTime() / 1000);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${period1}&period2=${period2}`;
      const headers = Platform.OS === 'web' ? {} : { headers: { 'User-Agent': 'Mozilla/5.0' } };
      const res = await fetchWithCORS(url, headers);
      const json = await res.json();
      const closes: number[] | undefined = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      if (closes && closes.length > 0) {
        const lastClose = [...closes].reverse().find(v => v != null);
        if (lastClose != null) priceTWD = lastClose * usdTwdRate;
      }
    } catch {
      // ignore
    }
  }

  if (priceTWD != null) {
    await setStockPriceCache({
      ticker: cacheKey,
      price: priceTWD,
      currency: 'TWD',
      lastUpdated: '2099-01-01T00:00:00.000Z', // 歷史價格永久有效
    });
  }

  return priceTWD;
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

