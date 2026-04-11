/**
 * ETF 持股明細工具
 * 資料來源：
 *   - QQQ, SMH → Alpha Vantage ETF_PROFILE API
 *   - 006208    → TWSE 官方 API（台灣50成分股）
 *   - GLD, IBIT → 靜態說明（單一實物資產 ETF）
 * 快取策略：7 天（SQLite etf_holdings table）
 */
import { Platform } from 'react-native';
import { getETFHoldings as getETFHoldingsFromDB, saveETFHoldings, getAlphaVantageApiKey } from './storage';
import { fetchWithCORS } from './stockPrice';
import type { ETFHolding } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * DAY_MS;
const REFRESH_COOLDOWN_MS = 30 * 1000;
const REFRESH_LOG_PREFIX = '[ETF Holdings]';
const inflightRefreshMap = new Map<string, Promise<ETFHolding[]>>();
const lastRefreshAtMap = new Map<string, number>();

export const SUPPORTED_ETF_TICKERS = ['QQQ', 'SMH', 'GLD', 'IBIT', '006208'];

/** 單一實物資產 ETF（不需抓持股，顯示靜態說明） */
const SINGLE_ASSET_DESCRIPTIONS: Record<string, string> = {
  IBIT: '比特幣現貨 ETF\n持倉為 100% Bitcoin',
  GLD:  '實體黃金 ETF\n持倉為 100% 黃金（現貨金條）',
};

export function isSingleAssetETF(ticker: string): boolean {
  return ticker in SINGLE_ASSET_DESCRIPTIONS;
}

/** 取得單一資產 ETF 的靜態說明文字 */
export function getSingleAssetDescription(ticker: string): string {
  return SINGLE_ASSET_DESCRIPTIONS[ticker] ?? '';
}

function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < CACHE_TTL_MS;
}

// ─── 各來源抓取函式 ────────────────────────────────────────────────

/** Alpha Vantage ETF_PROFILE — 用於 QQQ, SMH */
async function fetchAlphaVantageHoldings(ticker: string): Promise<ETFHolding[]> {
  // Alpha Vantage 不支援 CORS，web 版無法透過瀏覽器直接呼叫
  if (Platform.OS === 'web') {
    throw new Error('ETF 持股資料僅支援 iOS / Android，網頁版因 CORS 限制無法使用');
  }
  const apiKey = await getAlphaVantageApiKey();
  if (!apiKey) {
    throw new Error('尚未設定 Alpha Vantage API Key，請至設定頁新增');
  }
  const url = `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const headers = { headers: { 'User-Agent': 'Mozilla/5.0' } };

  const res = await fetchWithCORS(url, headers);
  const json = await res.json();

  // 超過每日限額時，Alpha Vantage 只回傳 Note 欄位
  if (json?.Note && !json?.holdings) {
    throw new Error('Alpha Vantage 已達每日 25 次上限，請明天再試');
  }
  if (json?.Information) {
    throw new Error('Alpha Vantage API 異常：' + json.Information);
  }

  const holdings: Array<{ symbol?: string; description?: string; weight?: string }> =
    json?.holdings ?? [];

  if (holdings.length === 0) {
    throw new Error(`Alpha Vantage: no holdings for ${ticker}`);
  }

  const now = new Date().toISOString();
  return holdings.slice(0, 15).map((h, i) => ({
    etfTicker: ticker,
    rank: i + 1,
    companyName: h.description ?? h.symbol ?? '—',
    stockTicker: h.symbol ?? undefined,
    weightPct: parseFloat(h.weight ?? '0') * 100,
    lastUpdated: now,
  }));
}

/** TWSE 台灣50成分股 — 用於 006208 */
async function fetchTWSE006208Holdings(): Promise<ETFHolding[]> {
  // TWSE 公開的台灣50指數成分股（006208 追蹤此指數）
  const url = 'https://www.twse.com.tw/rwd/zh/fund/TWT50U?response=json';
  const res = await fetchWithCORS(url);
  const json = await res.json();

  // 回傳格式：{ data: [["排名","代號","名稱","市值(億)","權重(%)"], ...] }
  const rows: string[][] = json?.data ?? [];
  if (rows.length === 0) {
    throw new Error('TWSE: no data for 006208');
  }

  const now = new Date().toISOString();
  return rows.slice(0, 15).map((row, i) => {
    // row: [排名, 股票代號, 股票名稱, 市值, 權重%]
    const weightStr = (row[4] ?? '0').replace('%', '').replace(',', '').trim();
    return {
      etfTicker: '006208',
      rank: i + 1,
      companyName: row[2] ?? '—',
      weightPct: parseFloat(weightStr) || 0,
      lastUpdated: now,
    };
  });
}

/** 依 ticker 路由到正確的抓取函式 */
async function fetchHoldings(ticker: string): Promise<ETFHolding[]> {
  switch (ticker) {
    case 'QQQ':
    case 'SMH':
      return fetchAlphaVantageHoldings(ticker);
    case '006208':
      return fetchTWSE006208Holdings();
    default:
      return []; // 尚未支援的 ETF，回傳空陣列
  }
}

function getOrCreateRefreshPromise(ticker: string): Promise<ETFHolding[]> {
  const inflight = inflightRefreshMap.get(ticker);
  if (inflight) return inflight;

  const task = (async () => {
    lastRefreshAtMap.set(ticker, Date.now());
    const fresh = await fetchHoldings(ticker);
    await saveETFHoldings(fresh);
    return fresh;
  })().finally(() => {
    inflightRefreshMap.delete(ticker);
  });

  inflightRefreshMap.set(ticker, task);
  return task;
}

function isInRefreshCooldown(ticker: string): boolean {
  const lastRefreshAt = lastRefreshAtMap.get(ticker);
  if (!lastRefreshAt) return false;
  return Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS;
}

function triggerStaleRefreshInBackground(ticker: string): void {
  if (inflightRefreshMap.has(ticker)) return;
  if (isInRefreshCooldown(ticker)) return;
  void getOrCreateRefreshPromise(ticker).catch((error: unknown) => {
    console.warn(`${REFRESH_LOG_PREFIX} stale refresh failed for ${ticker}:`, error);
  });
}

// ─── 公開 API ─────────────────────────────────────────────────────

/**
 * 取得 ETF 持股（優先使用快取，超過 7 天背景刷新）
 * - 不支援的 ticker 回傳空陣列
 * - 單一資產 ETF（GLD, IBIT）回傳空陣列，由 UI 顯示靜態說明
 */
export async function getETFHoldings(ticker: string): Promise<ETFHolding[]> {
  if (!SUPPORTED_ETF_TICKERS.includes(ticker)) return [];
  if (isSingleAssetETF(ticker)) return [];

  const cached = await getETFHoldingsFromDB(ticker);
  if (cached.length > 0) {
    if (!isCacheValid(cached[0].lastUpdated)) {
      triggerStaleRefreshInBackground(ticker);
    }
    return cached;
  }

  return getOrCreateRefreshPromise(ticker);
}

/**
 * 強制從網路重新抓取（忽略快取，刷新 DB）
 */
export async function refreshETFHoldings(ticker: string): Promise<ETFHolding[]> {
  if (!SUPPORTED_ETF_TICKERS.includes(ticker) || isSingleAssetETF(ticker)) return [];
  if (isInRefreshCooldown(ticker)) {
    const cached = await getETFHoldingsFromDB(ticker);
    if (cached.length > 0) return cached;
  }
  return getOrCreateRefreshPromise(ticker);
}
