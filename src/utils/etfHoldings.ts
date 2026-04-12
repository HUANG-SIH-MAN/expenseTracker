/**
 * ETF 持股明細工具
 * 資料來源：
 *   - QQQ, SMH → Alpha Vantage ETF_PROFILE API
 *   - 006208    → TWSE 官方 API（台灣50成分股）
 *   - GLD, IBIT → 靜態說明（單一實物資產 ETF）
 * 快取策略：7 天（SQLite etf_holdings table）
 */
import { Platform } from 'react-native';
import { getETFHoldings as getETFHoldingsFromDB, saveETFHoldings } from './storage';
import { fetchWithCORS } from './stockPrice';
import { fetchAlphaVantageData } from './alphaVantageApi';
import {
  ETF_HOLDINGS_CACHE_TTL_MS,
  ETF_HOLDINGS_REFRESH_COOLDOWN_MS,
} from './dataRefreshPolicy';
import { normalizeTicker } from './instrumentClassification';
import type { ETFHolding } from '../types';

const REFRESH_LOG_PREFIX = '[ETF Holdings]';
const TOP_HOLDINGS_LIMIT = 15;
const ZERO_WEIGHT = 0;
const ALPHA_VANTAGE_TOP_HOLDINGS_LIMIT = 15;
const MONEYDJ_006208_URL = 'https://www.moneydj.com/etf/x/basic/basic0007.xdjhtm?etfid=006208.tw';
const TWSE_TWT50U_URL = 'https://www.twse.com.tw/rwd/zh/fund/TWT50U?response=json';
const inflightRefreshMap = new Map<string, Promise<ETFHolding[]>>();
const lastRefreshAtMap = new Map<string, number>();

/** 單一實物資產 ETF（不需抓持股，顯示靜態說明） */
const SINGLE_ASSET_DESCRIPTIONS: Record<string, string> = {
  IBIT: '比特幣現貨 ETF\n持倉為 100% Bitcoin',
  GLD:  '實體黃金 ETF\n持倉為 100% 黃金（現貨金條）',
};

export function isSingleAssetETF(ticker: string): boolean {
  return normalizeTicker(ticker) in SINGLE_ASSET_DESCRIPTIONS;
}

/** 取得單一資產 ETF 的靜態說明文字 */
export function getSingleAssetDescription(ticker: string): string {
  return SINGLE_ASSET_DESCRIPTIONS[normalizeTicker(ticker)] ?? '';
}

type ETFHoldingsFetcher = (ticker: string) => Promise<ETFHolding[]>;

const ETF_HOLDINGS_FETCHERS: Record<string, ETFHoldingsFetcher> = {
  QQQ: fetchAlphaVantageHoldings,
  SMH: fetchAlphaVantageHoldings,
  '006208': fetch006208Holdings,
};

function getSupportedETFTickerSet(): Set<string> {
  return new Set<string>([
    ...Object.keys(ETF_HOLDINGS_FETCHERS),
    ...Object.keys(SINGLE_ASSET_DESCRIPTIONS),
  ]);
}

const SUPPORTED_ETF_TICKER_SET = getSupportedETFTickerSet();
export const SUPPORTED_ETF_TICKERS = Array.from(SUPPORTED_ETF_TICKER_SET);

export function getSupportedETFTickers(): string[] {
  return [...SUPPORTED_ETF_TICKERS];
}

export function getSupportedETFHoldingsTickers(): string[] {
  return Object.keys(ETF_HOLDINGS_FETCHERS);
}

export function isSupportedETFTicker(ticker: string): boolean {
  return SUPPORTED_ETF_TICKER_SET.has(normalizeTicker(ticker));
}

function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < ETF_HOLDINGS_CACHE_TTL_MS;
}

// ─── 各來源抓取函式 ────────────────────────────────────────────────

/** Alpha Vantage ETF_PROFILE — 用於 QQQ, SMH */
async function fetchAlphaVantageHoldings(ticker: string): Promise<ETFHolding[]> {
  // Alpha Vantage 不支援 CORS，web 版無法透過瀏覽器直接呼叫
  if (Platform.OS === 'web') {
    throw new Error('ETF 持股資料僅支援 iOS / Android，網頁版因 CORS 限制無法使用');
  }
  const json = await fetchAlphaVantageData('ETF_PROFILE', ticker);

  const holdings: Array<{ symbol?: string; description?: string; weight?: string }> =
    json?.holdings ?? [];

  if (holdings.length === 0) {
    throw new Error(`Alpha Vantage: no holdings for ${ticker}`);
  }

  const now = new Date().toISOString();
  return holdings.slice(0, ALPHA_VANTAGE_TOP_HOLDINGS_LIMIT).map((h, i) => ({
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
  const res = await fetchWithCORS(TWSE_TWT50U_URL);
  const json = await res.json();

  // 回傳格式：{ data: [["排名","代號","名稱","市值(億)","權重(%)"], ...] }
  const rows: string[][] = json?.data ?? [];
  if (rows.length === 0) {
    throw new Error('TWSE: no data for 006208');
  }

  const now = new Date().toISOString();
  return rows.slice(0, TOP_HOLDINGS_LIMIT).map((row, i) => {
    // row: [排名, 股票代號, 股票名稱, 市值, 權重%]
    const weightStr = (row[4] ?? '0').replace('%', '').replace(',', '').trim();
    const stockTicker = normalizeTicker((row[1] ?? '').trim());
    return {
      etfTicker: '006208',
      rank: i + 1,
      companyName: row[2] ?? '—',
      stockTicker: stockTicker || undefined,
      weightPct: parseFloat(weightStr) || 0,
      lastUpdated: now,
    };
  });
}

function parseWeightPercent(raw: string): number {
  const value = parseFloat(raw.replace(/,/g, '').replace('%', '').trim());
  return Number.isFinite(value) ? value : ZERO_WEIGHT;
}

/**
 * MoneyDJ 006208 持股表解析
 * 解析欄位樣式：
 *   <td class="col05"><a ...>台積電(2330.TW)</a></td>
 *   <td class="col06">63.85</td>
 */
function parseMoneyDJ006208Holdings(html: string): ETFHolding[] {
  const rowPattern = /<td class="col05">[\s\S]*?<a[^>]*>([^<]*?)\((\d{4,6})\.TW\)<\/a><\/td>\s*<td class="col06">([\d.,]+)<\/td>/g;
  const now = new Date().toISOString();
  const parsed: ETFHolding[] = [];
  let match: RegExpExecArray | null = rowPattern.exec(html);

  while (match != null && parsed.length < TOP_HOLDINGS_LIMIT) {
    const companyNameRaw = match[1]?.trim() || '';
    const stockCode = match[2]?.trim() || '';
    const weightPct = parseWeightPercent(match[3] ?? '');
    if (stockCode && weightPct > ZERO_WEIGHT) {
      parsed.push({
        etfTicker: '006208',
        rank: parsed.length + 1,
        companyName: companyNameRaw || stockCode,
        stockTicker: stockCode,
        weightPct,
        lastUpdated: now,
      });
    }
    match = rowPattern.exec(html);
  }

  return parsed;
}

/** MoneyDJ 持股（006208） */
async function fetchMoneyDJ006208Holdings(): Promise<ETFHolding[]> {
  const res = await fetchWithCORS(MONEYDJ_006208_URL);
  const html = await res.text();
  const parsed = parseMoneyDJ006208Holdings(html);
  if (parsed.length === 0) {
    throw new Error('MoneyDJ: no data for 006208');
  }
  return parsed;
}

/**
 * 006208 來源策略
 * 1) TWSE 舊端點（若恢復可直接使用）
 * 2) MoneyDJ 備援
 */
async function fetch006208Holdings(): Promise<ETFHolding[]> {
  try {
    return await fetchTWSE006208Holdings();
  } catch {
    return fetchMoneyDJ006208Holdings();
  }
}

/** 依 ticker 路由到正確的抓取函式 */
async function fetchHoldings(ticker: string): Promise<ETFHolding[]> {
  const fetcher = ETF_HOLDINGS_FETCHERS[ticker];
  if (!fetcher) return [];
  return fetcher(ticker);
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
  return Date.now() - lastRefreshAt < ETF_HOLDINGS_REFRESH_COOLDOWN_MS;
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
  const normalizedTicker = normalizeTicker(ticker);
  if (!isSupportedETFTicker(normalizedTicker)) return [];
  if (isSingleAssetETF(normalizedTicker)) return [];

  const cached = await getETFHoldingsFromDB(normalizedTicker);
  if (cached.length > 0) {
    if (!isCacheValid(cached[0].lastUpdated)) {
      triggerStaleRefreshInBackground(normalizedTicker);
    }
    return cached;
  }

  return getOrCreateRefreshPromise(normalizedTicker);
}

/**
 * 強制從網路重新抓取（忽略快取，刷新 DB）
 */
export async function refreshETFHoldings(ticker: string): Promise<ETFHolding[]> {
  const normalizedTicker = normalizeTicker(ticker);
  if (!isSupportedETFTicker(normalizedTicker) || isSingleAssetETF(normalizedTicker)) return [];
  if (isInRefreshCooldown(normalizedTicker)) {
    const cached = await getETFHoldingsFromDB(normalizedTicker);
    if (cached.length > 0) return cached;
  }
  return getOrCreateRefreshPromise(normalizedTicker);
}
