import { Platform } from "react-native";
import type { StockAnnualFinancial, StockFundamentals } from "../types";
import { getAlphaVantageApiKey } from "./storage";
import {
  getStockFundamentals as getFromStorage,
  saveStockFundamentals,
} from "./storage";
import { fetchWithCORS } from "./stockPrice";

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_DAYS = 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * DAY_MS;
const REFRESH_COOLDOWN_MS = 30 * 1000;
const REFRESH_LOG_PREFIX = "[Stock Fundamentals]";
const inflightRefreshMap = new Map<string, Promise<StockFundamentals>>();
const lastRefreshAtMap = new Map<string, number>();

function isCacheValid(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() < CACHE_TTL_MS;
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
  apiKey: string
): Promise<Omit<StockFundamentals, "ticker" | "annualFinancials" | "lastUpdated">> {
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithCORS(url);
  const json = await res.json();

  if (json?.Note) {
    throw new Error("Alpha Vantage 已達每日 25 次上限，請明天再試");
  }
  if (json?.Information) {
    throw new Error("Alpha Vantage API 錯誤：" + json.Information);
  }
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
  apiKey: string
): Promise<StockAnnualFinancial[]> {
  const url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithCORS(url);
  const json = await res.json();

  if (json?.Note) {
    throw new Error("Alpha Vantage 已達每日 25 次上限，請明天再試");
  }
  if (json?.Information) {
    throw new Error("Alpha Vantage API 錯誤：" + json.Information);
  }

  const reports: Record<string, string>[] = json?.annualReports ?? [];
  return reports.slice(0, 5).map((r) => ({
    fiscalYear: r.fiscalDateEnding ?? "",
    totalRevenue: parseNum(r.totalRevenue) ?? 0,
    grossProfit: parseNum(r.grossProfit) ?? 0,
    netIncome: parseNum(r.netIncome) ?? 0,
    operatingIncome: parseNum(r.operatingIncome) ?? 0,
  }));
}

async function fetchAndSave(ticker: string): Promise<StockFundamentals> {
  if (Platform.OS === "web") {
    throw new Error("基本面資料僅支援 iOS / Android，網頁版因 CORS 限制無法使用");
  }

  const apiKey = await getAlphaVantageApiKey();
  if (!apiKey) {
    throw new Error("請先在設定中輸入 Alpha Vantage API Key");
  }

  const [overview, annualFinancials] = await Promise.all([
    fetchOverview(ticker, apiKey),
    fetchIncomeStatement(ticker, apiKey),
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
  return Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS;
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
  const cached = await getFromStorage(ticker);
  if (cached) {
    if (!isCacheValid(cached.lastUpdated)) {
      triggerStaleRefreshInBackground(ticker);
    }
    return cached;
  }
  return getOrCreateRefreshPromise(ticker);
}

/** 強制重新抓取，忽略快取（手動刷新按鈕） */
export async function refreshStockFundamentals(
  ticker: string
): Promise<StockFundamentals> {
  if (isInRefreshCooldown(ticker)) {
    const cached = await getFromStorage(ticker);
    if (cached) return cached;
  }
  return getOrCreateRefreshPromise(ticker);
}
