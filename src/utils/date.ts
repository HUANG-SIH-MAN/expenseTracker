/**
 * 日期顯示與解析
 */

/** 將 YYYY-MM-DD 轉成「M月D日」 */
export function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${m}月${d}日`;
}

/** 將 YYYY-MM-DD 轉成「YYYY年M月」 */
export function formatYearMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 取得今天 YYYY-MM-DD */
export function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
