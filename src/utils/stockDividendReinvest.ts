/**
 * 股利再投資（DRIP）備註標記：儲存仍為 type=buy，以備註識別。
 */

/** 與計畫一致之固定字串，供備註與列表辨識用 */
export const STOCK_DIVIDEND_REINVEST_NOTE_TAG = '股利再投資';

export function noteIndicatesDividendReinvest(note: string | undefined): boolean {
  if (note == null || note.trim() === '') return false;
  return note.includes(STOCK_DIVIDEND_REINVEST_NOTE_TAG);
}

/**
 * 依開關狀態調整備註：開啟時確保含標記；關閉時移除結構化前綴。
 */
export function applyDividendReinvestToNote(note: string, enabled: boolean): string {
  const trimmed = note.trim();
  if (enabled) {
    if (trimmed.includes(STOCK_DIVIDEND_REINVEST_NOTE_TAG)) return trimmed;
    return trimmed.length > 0
      ? `${STOCK_DIVIDEND_REINVEST_NOTE_TAG} · ${trimmed}`
      : STOCK_DIVIDEND_REINVEST_NOTE_TAG;
  }
  return stripDividendReinvestMarker(trimmed);
}

/** 移除結構化「股利再投資」前綴或整段僅標記之備註 */
export function stripDividendReinvestMarker(s: string): string {
  const t = s.trim();
  if (t === STOCK_DIVIDEND_REINVEST_NOTE_TAG) return '';
  const re = new RegExp(
    `^${escapeRegExp(STOCK_DIVIDEND_REINVEST_NOTE_TAG)}\\s*[·/]\\s*(.*)$`,
    's',
  );
  const m = t.match(re);
  if (m) return m[1].trim();
  return t;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
