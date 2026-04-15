/**
 * 台灣國定假日工具
 *
 * 資料來源：政府開放資料平台 - 中華民國政府行政機關辦公日曆表
 * Dataset API: https://data.gov.tw/api/v2/rest/dataset/14718
 *
 * 流程：
 *   1. 呼叫 dataset API 拿到當年度的 CSV 下載網址
 *   2. 下載 CSV，解析 `是否放假=2` 的日期
 *   3. 結果存入 AsyncStorage 快取（key: taiwan_holidays_YYYY）
 *
 * CSV 欄位（UTF-8，第一欄含 BOM）：
 *   西元日期   星期   是否放假   備註
 *   20260101   四     2         開國紀念日
 *   20260102   五     0
 *
 * 是否放假：0 = 上班（含補班日），2 = 放假
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── 常數 ─────────────────────────────────────────────────────────────────────

const DATASET_API = 'https://data.gov.tw/api/v2/rest/dataset/14718';
const CACHE_KEY_PREFIX = 'taiwan_holidays_';
const IS_HOLIDAY_VALUE = '2';

// ── 型別 ─────────────────────────────────────────────────────────────────────

interface Distribution {
  resourceDescription: string;
  resourceFormat: string;
  resourceDownloadUrl: string;
}

interface DatasetApiResponse {
  success: boolean;
  result?: {
    distribution: Distribution[];
  };
}

// ── 內部工具 ──────────────────────────────────────────────────────────────────

function cacheKey(year: number): string {
  return `${CACHE_KEY_PREFIX}${year}`;
}

/** 西元年 → 民國年（例：2026 → 115） */
function toRocYear(westernYear: number): number {
  return westernYear - 1911;
}

/** 將 YYYYMMDD 轉為 YYYY-MM-DD */
function toDateKey(yyyymmdd: string): string {
  const s = yyyymmdd.trim();
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * 從 dataset API 回傳的 distribution 清單中，找出對應年份的 CSV 下載網址。
 * 優先選最後一個符合條件的（即最新更新版），排除 Google 行事曆專用格式。
 */
function findCsvUrl(distributions: Distribution[], rocYear: number): string | null {
  const prefix = `${rocYear}年`;
  const candidates = distributions.filter(
    (d) =>
      d.resourceDescription.startsWith(prefix) &&
      d.resourceFormat === 'CSV' &&
      !d.resourceDescription.includes('Google')
  );
  if (candidates.length === 0) return null;
  // 有多個時取最後一個（通常是最新修正版）
  return candidates[candidates.length - 1].resourceDownloadUrl;
}

/**
 * 解析 CSV 文字，回傳 `是否放假=2` 的日期清單（YYYY-MM-DD）。
 * 支援 UTF-8 BOM 開頭。
 */
function parseCsv(csvText: string): string[] {
  const lines = csvText
    .replace(/^\uFEFF/, '') // 移除 BOM
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // 第一行是 header，跳過
  const holidays: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const date = cols[0]?.trim();
    const isHoliday = cols[2]?.trim();
    if (date && isHoliday === IS_HOLIDAY_VALUE && date.length === 8) {
      holidays.push(toDateKey(date));
    }
  }
  return holidays;
}

// ── 公開函式 ─────────────────────────────────────────────────────────────────

/**
 * 向政府 API 取得指定年份的所有放假日期（YYYY-MM-DD 字串陣列）。
 * 失敗時回傳 null（不拋出）。
 */
export async function fetchTaiwanHolidays(year: number): Promise<string[] | null> {
  try {
    console.log(`[TaiwanHolidays] 開始取得 ${year} 年假日資料...`);

    // Step 1: 查詢 dataset API 取得 CSV 下載網址
    const metaRes = await fetch(DATASET_API);
    if (!metaRes.ok) {
      console.warn(`[TaiwanHolidays] dataset API 回應失敗: ${metaRes.status}`);
      return null;
    }
    const meta = (await metaRes.json()) as DatasetApiResponse;
    if (!meta.success || !meta.result?.distribution) {
      console.warn('[TaiwanHolidays] dataset API 回傳格式異常', meta);
      return null;
    }

    const rocYear = toRocYear(year);
    const csvUrl = findCsvUrl(meta.result.distribution, rocYear);
    if (!csvUrl) {
      console.warn(`[TaiwanHolidays] 找不到 ${rocYear}年（${year}）的 CSV 資源，可能尚未公告`);
      return null;
    }
    console.log(`[TaiwanHolidays] CSV 網址: ${csvUrl}`);

    // Step 2: 下載 CSV
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      console.warn(`[TaiwanHolidays] CSV 下載失敗: ${csvRes.status}`);
      return null;
    }
    const csvText = await csvRes.text();

    // Step 3: 解析
    const holidays = parseCsv(csvText);
    console.log(`[TaiwanHolidays] ${year} 年共解析到 ${holidays.length} 個放假日（含六日）`);
    return holidays;
  } catch (err) {
    console.error('[TaiwanHolidays] 取得假日資料時發生例外:', err);
    return null;
  }
}

/**
 * 取得指定年份的放假日期清單。
 * 優先使用 AsyncStorage 快取；快取不存在時呼叫 API 並寫入快取。
 * 若 API 失敗且無快取，回傳空陣列（fallback 行為：只用六日判斷）。
 */
export async function getCachedTaiwanHolidays(year: number): Promise<string[]> {
  try {
    const cached = await AsyncStorage.getItem(cacheKey(year));
    if (cached !== null) {
      const list = JSON.parse(cached) as string[];
      console.log(`[TaiwanHolidays] ${year} 年假日從快取載入，共 ${list.length} 筆`);
      return list;
    }
    const fetched = await fetchTaiwanHolidays(year);
    if (fetched !== null && fetched.length > 0) {
      await AsyncStorage.setItem(cacheKey(year), JSON.stringify(fetched));
      console.log(`[TaiwanHolidays] ${year} 年假日已寫入快取`);
      return fetched;
    }
  } catch (err) {
    console.error('[TaiwanHolidays] 快取讀寫失敗:', err);
  }
  console.warn(`[TaiwanHolidays] ${year} 年假日無法取得，使用空清單（fallback）`);
  return [];
}

/**
 * 若目前是 12 月，嘗試預先抓取次年假日並寫入快取。
 * 已有快取的話不覆蓋；API 尚未公告（回傳 null 或空）則靜默忽略。
 * 設計為 fire-and-forget，不應 await。
 */
export async function prefetchNextYearIfDecember(currentYear: number, currentMonth: number): Promise<void> {
  if (currentMonth !== 12) return;
  const nextYear = currentYear + 1;
  try {
    const existing = await AsyncStorage.getItem(cacheKey(nextYear));
    if (existing !== null) {
      console.log(`[TaiwanHolidays] ${nextYear} 年假日快取已存在，略過預抓`);
      return;
    }
    console.log(`[TaiwanHolidays] 12月，開始預抓 ${nextYear} 年假日...`);
    const fetched = await fetchTaiwanHolidays(nextYear);
    if (fetched !== null && fetched.length > 0) {
      await AsyncStorage.setItem(cacheKey(nextYear), JSON.stringify(fetched));
      console.log(`[TaiwanHolidays] ${nextYear} 年假日預抓完成`);
    }
  } catch {
    // prefetch failure is non-critical
  }
}
