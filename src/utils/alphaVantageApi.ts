import {
  getAlphaVantageApiKeys,
  markAlphaVantageApiKeyRateLimited,
} from "./storage";
import { fetchWithCORS } from "./stockPrice";

const REQUEST_TIMEOUT_HEADERS = { headers: { "User-Agent": "Mozilla/5.0" } };
const RATE_LIMIT_NOTE_FIELD = "Note";
const INFORMATION_FIELD = "Information";
const KEY_BLOCKED_HINT_PREFIX = "Alpha Vantage API Key 今日額度皆已用完";

type AlphaVantageJson = Record<string, unknown>;

function isBlockedUntilFuture(blockedUntil?: string): boolean {
  if (!blockedUntil) return false;
  const blockedUntilMs = new Date(blockedUntil).getTime();
  return Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now();
}

function readStringField(data: AlphaVantageJson, field: string): string | null {
  const raw = data[field];
  return typeof raw === "string" ? raw : null;
}

function buildAllBlockedMessage(entries: Awaited<ReturnType<typeof getAlphaVantageApiKeys>>): string {
  const blockedUntilList = entries
    .map((entry) => entry.blockedUntil)
    .filter((value): value is string => typeof value === "string")
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && value > Date.now())
    .sort((a, b) => a - b);

  const nearestMs = blockedUntilList[0];
  if (!nearestMs) {
    return `${KEY_BLOCKED_HINT_PREFIX}，請明天再試`;
  }

  const nearestText = new Date(nearestMs).toLocaleString("zh-TW", {
    hour12: false,
  });
  return `${KEY_BLOCKED_HINT_PREFIX}，最早可於 ${nearestText} 再試`;
}

function buildAlphaVantageUrl(functionName: string, symbol: string, apiKey: string): string {
  return `https://www.alphavantage.co/query?function=${encodeURIComponent(functionName)}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
}

export async function fetchAlphaVantageData(
  functionName: string,
  symbol: string,
): Promise<AlphaVantageJson> {
  const entries = await getAlphaVantageApiKeys();
  if (entries.length === 0) {
    throw new Error("尚未設定 Alpha Vantage API Key，請至設定頁新增");
  }

  const availableEntries = entries.filter(
    (entry) => !isBlockedUntilFuture(entry.blockedUntil),
  );
  if (availableEntries.length === 0) {
    throw new Error(buildAllBlockedMessage(entries));
  }

  let latestInformation: string | null = null;
  for (const entry of availableEntries) {
    const url = buildAlphaVantageUrl(functionName, symbol, entry.key);
    const res = await fetchWithCORS(url, REQUEST_TIMEOUT_HEADERS);
    const json = (await res.json()) as AlphaVantageJson;
    const note = readStringField(json, RATE_LIMIT_NOTE_FIELD);
    if (note) {
      await markAlphaVantageApiKeyRateLimited(entry.key);
      continue;
    }
    const information = readStringField(json, INFORMATION_FIELD);
    if (information) {
      latestInformation = information;
      continue;
    }
    return json;
  }

  const refreshedEntries = await getAlphaVantageApiKeys();
  if (refreshedEntries.every((entry) => isBlockedUntilFuture(entry.blockedUntil))) {
    throw new Error(buildAllBlockedMessage(refreshedEntries));
  }

  if (latestInformation) {
    throw new Error(`Alpha Vantage API 異常：${latestInformation}`);
  }
  throw new Error("Alpha Vantage 請求失敗，請稍後再試");
}
