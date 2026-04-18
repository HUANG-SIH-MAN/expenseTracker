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
import { isSingleAssetETF } from "./etfHoldings";

const REFRESH_LOG_PREFIX = "[Stock Fundamentals]";
const inflightRefreshMap = new Map<string, Promise<StockFundamentals>>();
const lastRefreshAtMap = new Map<string, number>();
const TAIWAN_WEEK_52_MONTH_COUNT = 12;
const TAIWAN_FINANCIAL_YEAR_COUNT = 5;
const TAIWAN_FINANCIAL_EXTRA_LOOKBACK_YEARS = 3;
const TWSE_OPENAPI_BASE_URL = "https://openapi.twse.com.tw/v1";
const FINMIND_DATA_API_URL = "https://api.finmindtrade.com/api/v4/data";
const FINMIND_DATASET_TAIWAN_STOCK_FINANCIAL_STATEMENTS = "TaiwanStockFinancialStatements";
const FINMIND_DATASET_TAIWAN_STOCK_PER = "TaiwanStockPER";
const FINMIND_ANNUAL_DATE_SUFFIX = "-12-31";
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const BETA_SAMPLE_RANGE = "1y";
const BETA_MIN_SAMPLE_COUNT = 30;
const TWSE_PROFILE_ENDPOINT = `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap03_L`;
const TWSE_INCOME_STATEMENT_ENDPOINTS = [
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_ci`,
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_basi`,
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_fh`,
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_ins`,
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_bd`,
  `${TWSE_OPENAPI_BASE_URL}/opendata/t187ap06_L_mim`,
] as const;

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
  const normalized = String(val).replace(/,/g, "").trim();
  if (!normalized) return null;
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

function toYyyymmdd(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function getQuarterFromText(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const text = String(val ?? "").trim();
  if (!text) return null;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getYearFromText(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  const text = String(val ?? "").trim();
  if (!text) return null;
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJsonWithCors(url: string): Promise<unknown> {
  const res = await fetchWithCORS(url);
  return res.json();
}

function getRecordValueByKeyPattern(
  row: Record<string, unknown>,
  pattern: RegExp,
): unknown {
  const key = Object.keys(row).find((candidate) => pattern.test(candidate));
  return key ? row[key] : null;
}

async function fetchTaiwanIssuedShares(stockNo: string): Promise<number | null> {
  const data = await fetchJsonWithCors(TWSE_PROFILE_ENDPOINT);
  if (!Array.isArray(data)) return null;
  const row = data.find((item) => {
    const record = item as Record<string, unknown>;
    const code = String(record["公司代號"] ?? "").trim();
    return code === stockNo;
  }) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseNum(
    getRecordValueByKeyPattern(row, /已發行普通股數|原股發行股數/i),
  );
}

async function fetchTaiwan52WeekRange(stockNo: string): Promise<{ high: number; low: number } | null> {
  const prices: number[] = [];
  const now = new Date();
  const requests: Promise<unknown>[] = [];
  for (let monthOffset = 0; monthOffset < TAIWAN_WEEK_52_MONTH_COUNT; monthOffset += 1) {
    const requestDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const yyyymmdd = toYyyymmdd(requestDate);
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${encodeURIComponent(stockNo)}&date=${yyyymmdd}&response=json`;
    requests.push(fetchJsonWithCors(url).catch(() => null));
  }

  const results = await Promise.all(requests);
  results.forEach((json) => {
    if (!json || typeof json !== "object") return;
    const payload = json as { fields?: unknown; data?: unknown };
    const fields = Array.isArray(payload.fields) ? payload.fields.map((item) => String(item)) : [];
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const highIndex = fields.findIndex((field) => /最高價/.test(field));
    const lowIndex = fields.findIndex((field) => /最低價/.test(field));
    if (highIndex < 0 || lowIndex < 0) return;
    rows.forEach((row) => {
      if (!Array.isArray(row)) return;
      const high = parseNum(row[highIndex]);
      const low = parseNum(row[lowIndex]);
      if (high != null) prices.push(high);
      if (low != null) prices.push(low);
    });
  });

  if (prices.length === 0) return null;
  return {
    high: Math.max(...prices),
    low: Math.min(...prices),
  };
}

function buildFinMindDatasetUrl(dataset: string, stockNo: string, startDate: string): string {
  return `${FINMIND_DATA_API_URL}?dataset=${dataset}&data_id=${encodeURIComponent(stockNo)}&start_date=${startDate}`;
}

function toDateOnly(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function addYears(baseDate: Date, years: number): Date {
  const next = new Date(baseDate);
  next.setFullYear(baseDate.getFullYear() + years);
  return next;
}

async function fetchTaiwanLatestEpsFromFinMind(stockNo: string): Promise<number | null> {
  const startDate = toDateOnly(addYears(new Date(), -3));
  const url = buildFinMindDatasetUrl(
    FINMIND_DATASET_TAIWAN_STOCK_FINANCIAL_STATEMENTS,
    stockNo,
    startDate,
  );
  const json = await fetchJsonWithCors(url);
  const payload = json && typeof json === "object"
    ? (json as { data?: unknown })
    : {};
  const rows = Array.isArray(payload.data)
    ? (payload.data as Array<Record<string, unknown>>)
    : [];
  const epsRows = rows
    .filter((row) => String(row.stock_id ?? "").trim() === stockNo)
    .filter((row) => {
      const typeText = String(row.type ?? "");
      const originName = String(row.origin_name ?? "");
      return /EPS/i.test(typeText) || /每股盈餘/i.test(originName);
    })
    .map((row) => ({
      date: String(row.date ?? ""),
      value: parseNum(row.value),
    }))
    .filter((row) => row.value != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return epsRows[0]?.value ?? null;
}

async function fetchTaiwanLatestPerFromFinMind(stockNo: string): Promise<number | null> {
  const startDate = toDateOnly(addYears(new Date(), -1));
  const url = buildFinMindDatasetUrl(
    FINMIND_DATASET_TAIWAN_STOCK_PER,
    stockNo,
    startDate,
  );
  const json = await fetchJsonWithCors(url);
  const payload = json && typeof json === "object"
    ? (json as { data?: unknown })
    : {};
  const rows = Array.isArray(payload.data)
    ? (payload.data as Array<Record<string, unknown>>)
    : [];
  const perRows = rows
    .filter((row) => String(row.stock_id ?? "").trim() === stockNo)
    .map((row) => ({
      date: String(row.date ?? ""),
      value: parseNum((row as Record<string, unknown>).PER),
    }))
    .filter((row) => row.value != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return perRows[0]?.value ?? null;
}

function computeDailyReturns(closeMap: Map<string, number>): Map<string, number> {
  const dates = Array.from(closeMap.keys()).sort((a, b) => a.localeCompare(b));
  const returns = new Map<string, number>();
  for (let index = 1; index < dates.length; index += 1) {
    const prevDate = dates[index - 1];
    const currDate = dates[index];
    const prevClose = closeMap.get(prevDate);
    const currClose = closeMap.get(currDate);
    if (prevClose == null || currClose == null || prevClose <= 0) continue;
    returns.set(currDate, (currClose - prevClose) / prevClose);
  }
  return returns;
}

function toMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeBeta(
  stockReturns: Map<string, number>,
  marketReturns: Map<string, number>,
): number | null {
  const dates = Array.from(stockReturns.keys()).filter((date) => marketReturns.has(date));
  if (dates.length < BETA_MIN_SAMPLE_COUNT) return null;
  const stockSeries = dates.map((date) => stockReturns.get(date) as number);
  const marketSeries = dates.map((date) => marketReturns.get(date) as number);
  const stockMean = toMean(stockSeries);
  const marketMean = toMean(marketSeries);
  const covariance = dates.reduce((sum, _date, index) => {
    return sum + (stockSeries[index] - stockMean) * (marketSeries[index] - marketMean);
  }, 0) / dates.length;
  const variance = marketSeries.reduce((sum, value) => {
    return sum + (value - marketMean) ** 2;
  }, 0) / dates.length;
  if (variance <= 0) return null;
  return covariance / variance;
}

async function fetchYahooDailyCloseMap(symbol: string): Promise<Map<string, number>> {
  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=${BETA_SAMPLE_RANGE}`;
  const headers = Platform.OS === "web" ? {} : { headers: { "User-Agent": "Mozilla/5.0" } };
  const res = await fetchWithCORS(url, headers);
  const json = await res.json();
  const timestamps: number[] | undefined = json?.chart?.result?.[0]?.timestamp;
  const closes: Array<number | null> | undefined = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
  const closeMap = new Map<string, number>();
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return closeMap;
  const count = Math.min(timestamps.length, closes.length);
  for (let index = 0; index < count; index += 1) {
    const timestamp = timestamps[index];
    const close = closes[index];
    if (typeof timestamp !== "number") continue;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    closeMap.set(date, close);
  }
  return closeMap;
}

async function fetchTaiwanBeta(stockNo: string): Promise<number | null> {
  const stockSymbols = [`${stockNo}.TW`, `${stockNo}.TWO`];
  let stockCloseMap = new Map<string, number>();
  for (const symbol of stockSymbols) {
    try {
      const candidateMap = await fetchYahooDailyCloseMap(symbol);
      if (candidateMap.size >= BETA_MIN_SAMPLE_COUNT) {
        stockCloseMap = candidateMap;
        break;
      }
    } catch {
      // ignore and try next ticker suffix
    }
  }
  if (stockCloseMap.size < BETA_MIN_SAMPLE_COUNT) return null;

  let marketCloseMap = new Map<string, number>();
  try {
    marketCloseMap = await fetchYahooDailyCloseMap("^TWII");
  } catch {
    return null;
  }
  if (marketCloseMap.size < BETA_MIN_SAMPLE_COUNT) return null;
  return computeBeta(computeDailyReturns(stockCloseMap), computeDailyReturns(marketCloseMap));
}

function isFinMindAnnualDate(dateText: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText.endsWith(FINMIND_ANNUAL_DATE_SUFFIX);
}

function parseFinMindAnnualFinancialRows(rows: unknown[], stockNo: string): StockAnnualFinancial[] {
  const annualMap = new Map<string, Partial<StockAnnualFinancial>>();
  rows.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const currentStock = String(row.stock_id ?? "").trim();
    if (currentStock !== stockNo) return;
    const dateText = String(row.date ?? "").trim();
    if (!isFinMindAnnualDate(dateText)) return;

    const typeText = String(row.type ?? "");
    const originName = String(row.origin_name ?? "");
    const value = parseNum(row.value);
    if (value == null) return;

    const annual = annualMap.get(dateText) ?? { fiscalYear: dateText };
    if (/Revenue/i.test(typeText) || /營業收入/.test(originName)) {
      annual.totalRevenue = value;
    } else if (/GrossProfit/i.test(typeText) || /營業毛利/.test(originName)) {
      annual.grossProfit = value;
    } else if (/IncomeAfterTaxes|NetIncome/i.test(typeText) || /本期淨利/.test(originName)) {
      annual.netIncome = value;
    } else if (/OperatingIncome/i.test(typeText) || /營業利益/.test(originName)) {
      annual.operatingIncome = value;
    }
    annualMap.set(dateText, annual);
  });

  return Array.from(annualMap.values())
    .map((annual) => ({
      fiscalYear: annual.fiscalYear ?? "",
      totalRevenue: annual.totalRevenue ?? 0,
      grossProfit: annual.grossProfit ?? 0,
      netIncome: annual.netIncome ?? 0,
      operatingIncome: annual.operatingIncome ?? 0,
    }))
    .filter((annual) => annual.fiscalYear.length > 0)
    .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))
    .slice(0, TAIWAN_FINANCIAL_YEAR_COUNT);
}

async function fetchTaiwanAnnualFinancialsFromFinMind(stockNo: string): Promise<StockAnnualFinancial[]> {
  const currentYear = new Date().getFullYear();
  const lookbackYears = TAIWAN_FINANCIAL_YEAR_COUNT + TAIWAN_FINANCIAL_EXTRA_LOOKBACK_YEARS;
  const startYear = currentYear - lookbackYears;
  const startDate = `${startYear}-01-01`;
  const url = `${FINMIND_DATA_API_URL}?dataset=${FINMIND_DATASET_TAIWAN_STOCK_FINANCIAL_STATEMENTS}&data_id=${encodeURIComponent(stockNo)}&start_date=${startDate}`;
  const json = await fetchJsonWithCors(url);
  const payload = json && typeof json === "object"
    ? (json as { data?: unknown })
    : {};
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return parseFinMindAnnualFinancialRows(rows, stockNo);
}

function parseTaiwanIncomeStatementRows(
  rows: unknown[],
  stockNo: string,
): StockAnnualFinancial[] {
  const annualMap = new Map<number, StockAnnualFinancial>();
  rows.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const companyCode = String(row["公司代號"] ?? "").trim();
    if (companyCode !== stockNo) return;
    const quarter = getQuarterFromText(row["季別"]);
    if (quarter !== 4) return;
    const year = getYearFromText(row["年度"]);
    if (year == null) return;
    annualMap.set(year, {
      fiscalYear: `${year}-12-31`,
      totalRevenue: parseNum(getRecordValueByKeyPattern(row, /營業收入/i)) ?? 0,
      grossProfit: parseNum(getRecordValueByKeyPattern(row, /營業毛利（毛損）淨額|營業毛利（毛損）/i)) ?? 0,
      netIncome: parseNum(getRecordValueByKeyPattern(row, /本期淨利（淨損）|淨利（淨損）歸屬於母公司業主/i)) ?? 0,
      operatingIncome: parseNum(getRecordValueByKeyPattern(row, /營業利益（損失）/i)) ?? 0,
    });
  });

  return Array.from(annualMap.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, TAIWAN_FINANCIAL_YEAR_COUNT)
    .map((entry) => entry[1]);
}

async function fetchTaiwanAnnualFinancials(stockNo: string): Promise<StockAnnualFinancial[]> {
  try {
    const finMindAnnualFinancials = await fetchTaiwanAnnualFinancialsFromFinMind(stockNo);
    if (finMindAnnualFinancials.length >= TAIWAN_FINANCIAL_YEAR_COUNT) {
      return finMindAnnualFinancials;
    }
    if (finMindAnnualFinancials.length > 0) {
      return finMindAnnualFinancials;
    }
  } catch {
    // fallback to TWSE OpenAPI snapshots
  }

  const annualFinancials: StockAnnualFinancial[] = [];
  for (const endpoint of TWSE_INCOME_STATEMENT_ENDPOINTS) {
    try {
      const data = await fetchJsonWithCors(endpoint);
      if (!Array.isArray(data)) continue;
      const fallbackAnnualFinancials = parseTaiwanIncomeStatementRows(data, stockNo);
      fallbackAnnualFinancials.forEach((item) => {
        if (annualFinancials.some((row) => row.fiscalYear === item.fiscalYear)) return;
        annualFinancials.push(item);
      });
      if (annualFinancials.length >= TAIWAN_FINANCIAL_YEAR_COUNT) break;
    } catch {
      // ignore and try the next endpoint
    }
  }
  return annualFinancials
    .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))
    .slice(0, TAIWAN_FINANCIAL_YEAR_COUNT);
}

async function fetchOverview(
  ticker: string,
): Promise<Omit<StockFundamentals, "ticker" | "annualFinancials" | "lastUpdated">> {
  console.log(`${REFRESH_LOG_PREFIX} fetchOverview START ticker=${ticker}`);
  let json: Record<string, unknown>;
  try {
    json = await fetchAlphaVantageData("OVERVIEW", ticker);
  } catch (e) {
    console.error(`${REFRESH_LOG_PREFIX} fetchOverview FETCH_ERROR ticker=${ticker}`, e);
    throw e;
  }
  console.log(`${REFRESH_LOG_PREFIX} fetchOverview RAW Symbol=${json?.Symbol} MarketCap=${json?.MarketCapitalization} 52WH=${json?.["52WeekHigh"]} 52WL=${json?.["52WeekLow"]}`);
  if (!json?.Symbol) {
    console.error(`${REFRESH_LOG_PREFIX} fetchOverview NO_SYMBOL ticker=${ticker} keys=${Object.keys(json ?? {}).join(',')}`);
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
  const annualReports = json?.annualReports;
  const reports: Record<string, string>[] = Array.isArray(annualReports)
    ? (annualReports as Record<string, string>[])
    : [];
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

  const yyyymmdd = toYyyymmdd(new Date());
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${yyyymmdd}&stockNo=${encodeURIComponent(twTicker)}&response=json`;
  const json = await fetchJsonWithCors(url);
  const payload = json && typeof json === "object"
    ? (json as { data?: unknown; fields?: unknown })
    : {};
  const rows: string[][] = Array.isArray(payload.data)
    ? (payload.data as string[][])
    : [];
  const fields: string[] = Array.isArray(payload.fields)
    ? payload.fields.map((item) => String(item))
    : [];
  const row = rows[0] ?? [];

  const peRatio = parseNum(tryGetCellByFieldPattern(fields, row, /本益比/));
  const eps = parseNum(tryGetCellByFieldPattern(fields, row, /EPS|每股盈餘/i));
  const [latestPrice, issuedShares, week52Range, annualFinancials, finMindPer, finMindEps, beta] = await Promise.all([
    getStockPrice(twTicker, "TWD"),
    fetchTaiwanIssuedShares(twTicker),
    fetchTaiwan52WeekRange(twTicker),
    fetchTaiwanAnnualFinancials(twTicker),
    fetchTaiwanLatestPerFromFinMind(twTicker).catch(() => null),
    fetchTaiwanLatestEpsFromFinMind(twTicker).catch(() => null),
    fetchTaiwanBeta(twTicker).catch(() => null),
  ]);
  const fallbackPrice = latestPrice?.price ?? 0;
  const marketCap = issuedShares != null ? fallbackPrice * issuedShares : 0;
  const week52High = week52Range?.high ?? fallbackPrice;
  const week52Low = week52Range?.low ?? fallbackPrice;

  return {
    ticker,
    marketCap,
    peRatio: peRatio ?? finMindPer,
    eps: eps ?? finMindEps,
    week52High,
    week52Low,
    beta,
    annualFinancials,
    lastUpdated: new Date().toISOString(),
  };
}

const TRADING_DAYS_PER_YEAR = 252;

async function fetchSingleAssetETFFundamentals(ticker: string): Promise<StockFundamentals> {
  console.log(`${REFRESH_LOG_PREFIX} fetchSingleAssetETFFundamentals START ticker=${ticker}`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  const headers = Platform.OS === 'web' ? {} : { headers: { 'User-Agent': 'Mozilla/5.0' } };
  const res = await fetchWithCORS(url, headers);
  const json = await res.json() as Record<string, unknown>;
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as Record<string, unknown> | undefined;
  const meta = result?.meta as Record<string, unknown> | undefined;
  const quotes = (result?.indicators as Record<string, unknown> | undefined)?.quote as unknown[] | undefined;
  const quote = Array.isArray(quotes) ? quotes[0] as Record<string, unknown> : undefined;

  const highs   = Array.isArray(quote?.high)   ? (quote!.high   as (number | null)[]) : [];
  const lows    = Array.isArray(quote?.low)    ? (quote!.low    as (number | null)[]) : [];
  const closes  = Array.isArray(quote?.close)  ? (quote!.close  as (number | null)[]) : [];
  const volumes = Array.isArray(quote?.volume) ? (quote!.volume as (number | null)[]) : [];

  const validHighs   = highs.filter((h): h is number => h != null && Number.isFinite(h));
  const validLows    = lows.filter((l): l is number => l != null && Number.isFinite(l));
  const validCloses  = closes.filter((c): c is number => c != null && Number.isFinite(c) && c > 0);
  const validVolumes = volumes.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

  const week52High = validHighs.length > 0
    ? Math.max(...validHighs)
    : (typeof meta?.fiftyTwoWeekHigh === 'number' ? meta.fiftyTwoWeekHigh : 0);
  const week52Low = validLows.length > 0
    ? Math.min(...validLows)
    : (typeof meta?.fiftyTwoWeekLow === 'number' ? meta.fiftyTwoWeekLow : 0);

  // 1年報酬率
  let return1Y: number | null = null;
  if (validCloses.length >= 2) {
    const first = validCloses[0];
    const last = validCloses[validCloses.length - 1];
    return1Y = (last - first) / first;
  }

  // 年化波動率（log return std dev × sqrt(252)）
  let annualizedVolatility: number | null = null;
  if (validCloses.length >= 2) {
    const logReturns: number[] = [];
    for (let i = 1; i < validCloses.length; i += 1) {
      logReturns.push(Math.log(validCloses[i] / validCloses[i - 1]));
    }
    const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / logReturns.length;
    annualizedVolatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  // 平均日成交量
  const avgDailyVolume = validVolumes.length > 0
    ? validVolumes.reduce((sum, v) => sum + v, 0) / validVolumes.length
    : null;

  // 1年收盤價歷史（供 Sparkline，最多保留 252 點）
  const priceHistory = validCloses.slice(-TRADING_DAYS_PER_YEAR);

  console.log(`${REFRESH_LOG_PREFIX} fetchSingleAssetETFFundamentals 52W high=${week52High} low=${week52Low} return1Y=${return1Y?.toFixed(4)} vol=${annualizedVolatility?.toFixed(4)}`);
  return {
    ticker,
    marketCap: typeof meta?.marketCap === 'number' ? meta.marketCap : 0,
    peRatio: null,
    eps: null,
    week52High,
    week52Low,
    beta: null,
    annualFinancials: [],
    lastUpdated: new Date().toISOString(),
    return1Y,
    annualizedVolatility,
    avgDailyVolume,
    priceHistory,
  };
}

async function fetchUSFundamentals(ticker: string): Promise<StockFundamentals> {
  console.log(`${REFRESH_LOG_PREFIX} fetchUSFundamentals START ticker=${ticker} platform=${Platform.OS}`);
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
  console.log(`${REFRESH_LOG_PREFIX} fetchAndSave ticker=${ticker} market=${classification.market} singleAsset=${isSingleAssetETF(ticker)}`);
  try {
    let data: StockFundamentals;
    if (isSingleAssetETF(ticker)) {
      data = await fetchSingleAssetETFFundamentals(ticker);
    } else if (classification.market === "TW") {
      data = await fetchTaiwanFundamentals(ticker);
    } else {
      data = await fetchUSFundamentals(ticker);
    }
    await saveStockFundamentals(data);
    console.log(`${REFRESH_LOG_PREFIX} fetchAndSave SUCCESS ticker=${ticker}`);
    return data;
  } catch (e) {
    console.error(`${REFRESH_LOG_PREFIX} fetchAndSave ERROR ticker=${ticker}`, e);
    throw e;
  }
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
  console.log(`${REFRESH_LOG_PREFIX} getStockFundamentals ticker=${normalizedTicker}`);
  const cached = await getFromStorage(normalizedTicker);
  if (cached) {
    const cacheAge = Date.now() - new Date(cached.lastUpdated).getTime();
    console.log(`${REFRESH_LOG_PREFIX} cache HIT ticker=${normalizedTicker} annualFinancials=${cached.annualFinancials.length} ageMs=${cacheAge}`);
    const classification = classifyInstrument({ ticker: normalizedTicker });
    const needsMoreFinancials = classification.market === 'TW' &&
      cached.annualFinancials.length < TAIWAN_FINANCIAL_YEAR_COUNT;
    if (!isCacheValid(cached.lastUpdated) || needsMoreFinancials) {
      triggerStaleRefreshInBackground(normalizedTicker);
    }
    return cached;
  }
  console.log(`${REFRESH_LOG_PREFIX} cache MISS ticker=${normalizedTicker} → fetching`);
  return getOrCreateRefreshPromise(normalizedTicker);
}

/** 強制重新抓取，忽略快取（手動刷新按鈕） */
export async function refreshStockFundamentals(
  ticker: string
): Promise<StockFundamentals> {
  const normalizedTicker = normalizeTicker(ticker);
  if (isInRefreshCooldown(normalizedTicker)) {
    const cached = await getFromStorage(normalizedTicker);
    if (cached && cached.annualFinancials.length >= TAIWAN_FINANCIAL_YEAR_COUNT) return cached;
  }
  return getOrCreateRefreshPromise(normalizedTicker);
}
