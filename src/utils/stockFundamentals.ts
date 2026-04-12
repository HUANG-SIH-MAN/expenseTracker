import { Platform } from "react-native";
import type { StockAnnualFinancial, StockFundamentals } from "../types";
import {
  getStockFundamentals as getFromStorage,
  saveStockFundamentals,
} from "./storage";
import { fetchWithCORS, getStockPrice } from "./stockPrice";
import { fetchAlphaVantageData } from "./alphaVantageApi";
import {
  FUNDAMENTALS_CACHE_TTL_MS,
  FUNDAMENTALS_REFRESH_COOLDOWN_MS,
} from "./dataRefreshPolicy";
import { classifyInstrument, normalizeTaiwanTicker, normalizeTicker } from "./instrumentClassification";

const REFRESH_LOG_PREFIX = "[Stock Fundamentals]";
const inflightRefreshMap = new Map<string, Promise<StockFundamentals>>();
const lastRefreshAtMap = new Map<string, number>();

function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < FUNDAMENTALS_CACHE_TTL_MS;
}

function toAnnualFinancials(val: unknown): StockAnnualFinancial[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => {
      const row = item as Partial<StockAnnualFinancial>;
      return {
        fiscalYear: typeof row.fiscalYear === "string" ? row.fiscalYear : "",
        totalRevenue: typeof row.totalRevenue === "number" ? row.totalRevenue : 0,
        grossProfit: typeof row.grossProfit === "number" ? row.grossProfit : 0,
        netIncome: typeof row.netIncome === "number" ? row.netIncome : 0,
        operatingIncome: typeof row.operatingIncome === "number" ? row.operatingIncome : 0,
      };
    })
    .filter((row) => row.fiscalYear.length > 0);
}

function parseNum(val: unknown): number | null {
  if (val === undefined || val === null || val === "None" || val === "-") {
    return null;
  }
  const n = parseFloat(val as string);
  return isNaN(n) ? null : n;
}

async function fetchOverview(
  ticker: string,
): Promise<Omit<StockFundamentals, "ticker" | "annualFinancials" | "lastUpdated">> {
  const json = await fetchAlphaVantageData("OVERVIEW", ticker);
  if (!json?.Symbol) {
    throw new Error(`找不到 ${ticker} 的基本面資料`);
  }

  return {
    marketCap: parseNum(json.MarketCapitalization) ?? 0,
    peRatio: parseNum(json.PERatio),
    eps: parseNum(json.EPS),
    week52High: parseNum(json["52WeekHigh"]) ?? 0,
    week52Low: parseNum(json["52WeekLow"]) ?? 0,
    beta: parseNum(json.Beta),
  };
}

async function fetchIncomeStatement(
  ticker: string,
): Promise<StockAnnualFinancial[]> {
  const json = await fetchAlphaVantageData("INCOME_STATEMENT", ticker);

  const reports: Record<string, string>[] = json?.annualReports ?? [];
  return reports.slice(0, 5).map((r) => ({
    fiscalYear: r.fiscalDateEnding ?? "",
    totalRevenue: parseNum(r.totalRevenue) ?? 0,
    grossProfit: parseNum(r.grossProfit) ?? 0,
    netIncome: parseNum(r.netIncome) ?? 0,
    operatingIncome: parseNum(r.operatingIncome) ?? 0,
  }));
}

function tryGetCellByFieldPattern(
  fields: string[],
  row: string[],
  pattern: RegExp
): string | null {
  const index = fields.findIndex((field) => pattern.test(field));
  if (index < 0) return null;
  const value = row[index];
  return typeof value === "string" ? value : null;
}

async function fetchTaiwanFundamentals(ticker: string): Promise<StockFundamentals> {
  const twTicker = normalizeTaiwanTicker(ticker);
  if (!/^\d{4,6}$/.test(twTicker)) {
    throw new Error(`不支援的台股代號格式：${ticker}`);
  }

  const date = new Date();
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${yyyymmdd}&stockNo=${encodeURIComponent(twTicker)}&response=json`;
  const res = await fetchWithCORS(url);
  const json = await res.json();
  const rows: string[][] = json?.data ?? [];
  const fields: string[] = json?.fields ?? [];
  const row = rows[0] ?? [];

  const peRatio = parseNum(tryGetCellByFieldPattern(fields, row, /本益比/));
  const eps = parseNum(tryGetCellByFieldPattern(fields, row, /EPS|每股盈餘/i));
  const latestPrice = await getStockPrice(twTicker, "TWD");
  const fallbackPrice = latestPrice?.price ?? 0;

  return {
    ticker,
    marketCap: 0,
    peRatio,
    eps,
    week52High: fallbackPrice,
    week52Low: fallbackPrice,
    beta: null,
    annualFinancials: [],
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchUSFundamentals(ticker: string): Promise<StockFundamentals> {
  if (Platform.OS === "web") {
    throw new Error("基本面資料僅支援 iOS / Android，網頁版因 CORS 限制無法使用");
  }

  const [overview, annualFinancials] = await Promise.all([
    fetchOverview(ticker),
    fetchIncomeStatement(ticker),
  ]);
  const safeOverview = overview ?? {
    marketCap: 0,
    peRatio: null,
    eps: null,
    week52High: 0,
    week52Low: 0,
    beta: null,
  };

  const data: StockFundamentals = {
    ticker,
    marketCap: safeOverview.marketCap,
    peRatio: safeOverview.peRatio,
    eps: safeOverview.eps,
    week52High: safeOverview.week52High,
    week52Low: safeOverview.week52Low,
    beta: safeOverview.beta,
    annualFinancials: toAnnualFinancials(annualFinancials),
    lastUpdated: new Date().toISOString(),
  };
  return data;
}

async function fetchAndSave(ticker: string): Promise<StockFundamentals> {
  const classification = classifyInstrument({ ticker });
  const data = classification.market === "TW"
    ? await fetchTaiwanFundamentals(ticker)
    : await fetchUSFundamentals(ticker);

  await saveStockFundamentals(data);
  return data;
}

function getOrCreateRefreshPromise(ticker: string): Promise<StockFundamentals> {
  const inflight = inflightRefreshMap.get(ticker);
  if (inflight) return inflight;

  const task = (async () => {
    lastRefreshAtMap.set(ticker, Date.now());
    return fetchAndSave(ticker);
  })().finally(() => {
    inflightRefreshMap.delete(ticker);
  });
  inflightRefreshMap.set(ticker, task);
  return task;
}

function isInRefreshCooldown(ticker: string): boolean {
  const lastRefreshAt = lastRefreshAtMap.get(ticker);
  if (!lastRefreshAt) return false;
  return Date.now() - lastRefreshAt < FUNDAMENTALS_REFRESH_COOLDOWN_MS;
}

function triggerStaleRefreshInBackground(ticker: string): void {
  if (inflightRefreshMap.has(ticker)) return;
  if (isInRefreshCooldown(ticker)) return;
  void getOrCreateRefreshPromise(ticker).catch((error: unknown) => {
    console.warn(`${REFRESH_LOG_PREFIX} stale refresh failed for ${ticker}:`, error);
  });
}

/** 讀取快取；若超過 7 天則先回舊資料並背景刷新 */
export async function getStockFundamentals(
  ticker: string
): Promise<StockFundamentals> {
  const normalizedTicker = normalizeTicker(ticker);
  const cached = await getFromStorage(normalizedTicker);
  if (cached) {
    if (!isCacheValid(cached.lastUpdated)) {
      triggerStaleRefreshInBackground(normalizedTicker);
    }
    return cached;
  }
  return getOrCreateRefreshPromise(normalizedTicker);
}

/** 強制重新抓取，忽略快取（手動刷新按鈕） */
export async function refreshStockFundamentals(
  ticker: string
): Promise<StockFundamentals> {
  const normalizedTicker = normalizeTicker(ticker);
  if (isInRefreshCooldown(normalizedTicker)) {
    const cached = await getFromStorage(normalizedTicker);
    if (cached) return cached;
  }
  return getOrCreateRefreshPromise(normalizedTicker);
}
