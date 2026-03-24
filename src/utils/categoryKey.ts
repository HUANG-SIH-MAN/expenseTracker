/**
 * 使用者新增／CSV 匯入自動建立的類別 key（與預設短 key 區隔）
 */
export function newCustomCategoryKey(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
