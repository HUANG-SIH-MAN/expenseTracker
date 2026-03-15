/**
 * 記帳本相關型別定義
 * 詳細欄位可於後續需求確定後擴充
 */

export type ExpenseCategory = 'food' | 'transport' | 'shopping' | 'entertainment' | 'other';

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  date: string; // ISO 8601 format
  createdAt: string;
}

export type ExpenseFormData = Omit<Expense, 'id' | 'createdAt'>;

/** 帳戶：用於記錄各存款/帳戶餘額 */
export interface Account {
  id: string;
  name: string;
  initialBalance: number;
}

/** 支援的貨幣代碼（可擴充） */
export type CurrencyCode = 'TWD' | 'USD' | 'JPY' | 'EUR' | 'CNY' | 'KRW' | 'GBP';

/** 導覽完成後儲存的設定 */
export interface OnboardingData {
  hasCompletedOnboarding: boolean;
  accounts: Account[];
  primaryCurrency: CurrencyCode;
}

/** 單筆類別項目（key 用於儲存與交易關聯，label 顯示名稱，icon 為 emoji） */
export interface CategoryItem {
  key: string;
  label: string;
  icon: string;
}

/** 使用者自訂的支出/收入類別列表（儲存於 AsyncStorage） */
export interface StoredCategories {
  expense: CategoryItem[];
  income: CategoryItem[];
}

/** 單筆交易類型：收入或支出 */
export type TransactionType = 'income' | 'expense';

/** 單筆交易（收入/支出） */
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  note?: string;
  /** 帳戶 ID，對應 Onboarding 設定的帳戶；未設定時顯示為「現金」 */
  accountId?: string;
  /** 若為固定收支自動帶入，存對應 RecurringItem.id；使用者編輯/刪除後會脫離或加入 skip */
  recurringId?: string;
  createdAt: string; // ISO 8601
}

/** 使用者刪除或編輯過的固定收支發生日，不再自動帶入 */
export interface RecurringSkipItem {
  recurringId: string;
  date: string; // YYYY-MM-DD
}

/** 固定收支週期 */
export type RecurringRepeat = 'monthly' | 'weekly';

/** 單筆固定收支（週期性範本，供提醒或自動寫入） */
export interface RecurringItem {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  note?: string;
  accountId?: string;
  /** 每月 / 每週 */
  repeat: RecurringRepeat;
  /** 每月時：1–28 日；每週時：0–6（0=週日） */
  day: number;
  createdAt: string; // ISO 8601
}
