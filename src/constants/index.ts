/**
 * 全域常數
 * 避免 Magic Number，便於維護與調整
 */

import type { KeyboardTypeOptions } from "react-native";

export const APP_NAME = "記帳本";

/**
 * 帳戶「目前／初始金額」等可為負數之欄位專用。
 * `decimal-pad` 僅有數字與小數點，無負號，信用卡欠款等情境無法輸入。
 */
export const KEYBOARD_SIGNED_DECIMAL: KeyboardTypeOptions =
  "numbers-and-punctuation";

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

/** AsyncStorage 鍵名 */
export const STORAGE_KEYS = {
  ONBOARDING: "@expense_tracker/onboarding",
  ACCOUNTS: "@expense_tracker/accounts",
  PRIMARY_CURRENCY: "@expense_tracker/primary_currency",
  TRANSACTIONS: "@expense_tracker/transactions",
  CATEGORIES: "@expense_tracker/categories",
  RECURRING: "@expense_tracker/recurring",
  RECURRING_SKIP: "@expense_tracker/recurring_skip",
  BUDGET_SETTINGS: "@expense_tracker/budget_settings",
  MONTHLY_FIXED_ITEMS: "@expense_tracker/monthly_fixed_items",
  ANNUAL_BUDGET_ENTRIES: "@expense_tracker/annual_budget_entries",
  EXCHANGE_RATES: "@expense_tracker/exchange_rates",
  CUSTOM_CURRENCIES: "@expense_tracker/custom_currencies",
  CREDIT_CARD_AUTOPAY_RULES: "@expense_tracker/credit_card_autopay_rules",
  CREDIT_CARD_AUTOPAY_EXECUTION_LOGS:
    "@expense_tracker/credit_card_autopay_execution_logs",
  CASH_TOPUP_RULES: "@expense_tracker/cash_topup_rules",
} as const;

/** 預設支出類別（之後可改為使用者自訂） */
export const DEFAULT_EXPENSE_CATEGORIES: Record<string, string> = {
  food: "飲食",
  transport: "交通",
  shopping: "購物",
  entertainment: "娛樂",
  other: "其他",
};

/** 預設收入類別 */
export const DEFAULT_INCOME_CATEGORIES: Record<string, string> = {
  salary: "薪水",
  bonus: "獎金",
  investment: "投資",
  other: "其他",
};

/** 類別對應圖示（用於列表顯示） */
export const CATEGORY_ICONS: Record<string, string> = {
  food: "🍽️",
  transport: "🚗",
  shopping: "🛒",
  entertainment: "🎤",
  other: "📌",
  salary: "💰",
  bonus: "🎁",
  investment: "📈",
};

/** 匯入 CSV 時自動建立之類別所使用的圖示（與預設「其他」一致，值同 `CATEGORY_ICONS.other`） */
export const DEFAULT_IMPORTED_CATEGORY_ICON = CATEGORY_ICONS.other;

/** 預設支出類別（含圖示，陣列形式供設定頁與儲存使用） */
export const DEFAULT_EXPENSE_CATEGORIES_LIST: {
  key: string;
  label: string;
  icon: string;
}[] = [
  { key: "food", label: "飲食", icon: "🍽️" },
  { key: "transport", label: "交通", icon: "🚗" },
  { key: "shopping", label: "購物", icon: "🛒" },
  { key: "entertainment", label: "娛樂", icon: "🎤" },
  { key: "other", label: "其他", icon: "📌" },
];

/** 預設收入類別（含圖示，陣列形式） */
export const DEFAULT_INCOME_CATEGORIES_LIST: {
  key: string;
  label: string;
  icon: string;
}[] = [
  { key: "salary", label: "薪水", icon: "💰" },
  { key: "bonus", label: "獎金", icon: "🎁" },
  { key: "investment", label: "投資", icon: "📈" },
  { key: "other", label: "其他", icon: "📌" },
];

/** 類別圖示選單（供使用者自訂類別時選擇） */
export const CATEGORY_ICON_OPTIONS: string[] = [
  "🍽️",
  "🚗",
  "🛒",
  "🎤",
  "📌",
  "💰",
  "🎁",
  "📈",
  "🏠",
  "🏥",
  "📚",
  "⛽",
  "☕",
  "🍕",
  "🎬",
  "🛍️",
  "✈️",
  "💊",
  "📱",
  "🐾",
  "🌿",
  "🎵",
  "⚽",
  "🍜",
  "🍱",
  "🥗",
  "🍰",
  "🥤",
  "🧋",
  "🚌",
  "🚇",
  "🚲",
  "🛵",
  "🚕",
  "🅿️",
  "💳",
  "🧾",
  "💡",
  "🔌",
  "💧",
  "🎮",
  "🎨",
  "🎲",
  "🧳",
  "🗺️",
  "🚂",
  "🏦",
  "💵",
  "🎓",
  "✏️",
  "💻",
  "⌚",
  "🩺",
  "🦷",
  "🧴",
  "🐶",
  "🐱",
  "🛋️",
  "🔧",
  "🧹",
  "👕",
  "👶",
  "🍼",
  "🏋️",
  "🎾",
  "🏀",
  "🌮",
  "🥟",
];

/** 預算：假日定義（0=週日, 6=週六） */
export const BUDGET_WEEKEND_DAY_INDICES: number[] = [0, 6];

/** 預算：平日權重（用於剩餘日預算分配） */
export const BUDGET_DEFAULT_WEEKDAY_WEIGHT = 1;

/** 預算：假日權重 */
export const BUDGET_DEFAULT_WEEKEND_WEIGHT = 1.5;

/** 預算設定在 settings 表的 key 前綴 */
export const BUDGET_SETTINGS_KEY_PREFIX = "budget/";

/** 內建貨幣代碼（依序顯示於選單） */
export const BUILT_IN_CURRENCY_CODES = [
  "TWD",
  "USD",
  "JPY",
  "EUR",
  "CNY",
  "KRW",
  "GBP",
] as const;

/** 內建貨幣：代碼 -> 顯示名稱 */
export const CURRENCY_LABELS: Record<string, string> = {
  TWD: "新台幣 (TWD)",
  USD: "美元 (USD)",
  JPY: "日圓 (JPY)",
  EUR: "歐元 (EUR)",
  CNY: "人民幣 (CNY)",
  KRW: "韓元 (KRW)",
  GBP: "英鎊 (GBP)",
};
