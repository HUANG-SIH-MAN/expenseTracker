/**
 * 匯率 API：取得各幣別對主幣別的匯率（1 單位外幣 = rate_to_primary 主幣）
 */
import type { CurrencyCode } from "../types";
import { BUILT_IN_CURRENCY_CODES } from "../constants";

const EXCHANGERATE_API_BASE = "https://api.exchangerate-api.com/v4/latest";

/** 匯率小數位數（避免 Magic Number） */
export const RATE_DECIMAL_PLACES = 6;

/**
 * 從 ExchangeRate-API 取得最新匯率。
 * API 回傳：base 幣別為 1 時，各 target 幣別的兌換比例（1 base = rates[code] target）。
 * 我們需要：1 單位外幣 = ? 主幣 → rate_to_primary = 1 / apiRates[code]（當 base 為主幣時）。
 * @param primaryCurrency 主幣別（如 TWD）
 * @param codes 要取得的幣別代碼；未傳則使用內建 7 種
 * @returns 各幣別對主幣的匯率（含主幣別自身為 1），失敗時回傳 null
 */
export async function fetchRatesToPrimary(
  primaryCurrency: CurrencyCode,
  codes?: string[],
): Promise<Record<string, number> | null> {
  try {
    const url = `${EXCHANGERATE_API_BASE}/${primaryCurrency}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      base?: string;
      rates?: Record<string, number>;
    };
    const rates = data?.rates;
    if (!rates || typeof rates !== "object") return null;

    const result: Record<string, number> = {};
    const codeList = codes?.length ? codes : [...BUILT_IN_CURRENCY_CODES];
    for (const code of codeList) {
      const apiRate = rates[code];
      if (code === primaryCurrency) {
        result[code] = 1;
      } else if (typeof apiRate === "number" && apiRate > 0) {
        result[code] = parseFloat(
          (1 / apiRate).toFixed(RATE_DECIMAL_PLACES),
        );
      }
    }
    return result;
  } catch {
    return null;
  }
}
