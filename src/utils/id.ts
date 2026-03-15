/**
 * 產生唯一 ID（用於帳戶、交易等）
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
