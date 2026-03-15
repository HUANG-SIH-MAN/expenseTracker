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
  createdAt: string; // ISO 8601
}
