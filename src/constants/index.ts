/**
 * 全域常數
 * 避免 Magic Number，便於維護與調整
 */

export const APP_NAME = '記帳本';

export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

/** AsyncStorage 鍵名 */
export const STORAGE_KEYS = {
  ONBOARDING: '@expense_tracker/onboarding',
  ACCOUNTS: '@expense_tracker/accounts',
  PRIMARY_CURRENCY: '@expense_tracker/primary_currency',
  TRANSACTIONS: '@expense_tracker/transactions',
} as const;

/** 預設支出類別（之後可改為使用者自訂） */
export const DEFAULT_EXPENSE_CATEGORIES: Record<string, string> = {
  food: '飲食',
  transport: '交通',
  shopping: '購物',
  entertainment: '娛樂',
  other: '其他',
};

/** 預設收入類別 */
export const DEFAULT_INCOME_CATEGORIES: Record<string, string> = {
  salary: '薪水',
  bonus: '獎金',
  investment: '投資',
  other: '其他',
};

/** 類別對應圖示（用於列表顯示） */
export const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  transport: '🚗',
  shopping: '🛒',
  entertainment: '🎤',
  other: '📌',
  salary: '💰',
  bonus: '🎁',
  investment: '📈',
};

/** 支援的貨幣：代碼 -> 顯示名稱 */
export const CURRENCY_LABELS: Record<string, string> = {
  TWD: '新台幣 (TWD)',
  USD: '美元 (USD)',
  JPY: '日圓 (JPY)',
  EUR: '歐元 (EUR)',
  CNY: '人民幣 (CNY)',
  KRW: '韓元 (KRW)',
  GBP: '英鎊 (GBP)',
};
