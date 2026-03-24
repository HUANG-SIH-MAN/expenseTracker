/**
 * 記帳本相關型別定義
 * 詳細欄位可於後續需求確定後擴充
 */

export type ExpenseCategory =
  | "food"
  | "transport"
  | "shopping"
  | "entertainment"
  | "other";

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  date: string; // ISO 8601 format
  createdAt: string;
}

export type ExpenseFormData = Omit<Expense, "id" | "createdAt">;

/** 帳戶：用於記錄各存款/帳戶餘額 */
export interface Account {
  id: string;
  name: string;
  initialBalance: number;
  /** 帳戶幣別，預設 TWD */
  currency: CurrencyCode;
}

/** 貨幣代碼（內建 + 使用者自訂，皆為字串如 TWD、AUD） */
export type CurrencyCode = string;

/** 單一幣別選項（供選單與顯示） */
export interface CurrencyOption {
  code: string;
  label: string;
  isBuiltIn: boolean;
}

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
  /** 新增交易選此類別時預先帶入的帳戶；單筆仍可改選 */
  defaultAccountId?: string;
}

/** 使用者自訂的支出/收入類別列表（儲存於 AsyncStorage） */
export interface StoredCategories {
  expense: CategoryItem[];
  income: CategoryItem[];
}

/** 單筆交易類型：收入、支出或轉帳 */
export type TransactionType = "income" | "expense" | "transfer";

/** 單筆交易（收入/支出/轉帳） */
export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  note?: string;
  /** 帳戶 ID，對應 Onboarding 設定的帳戶；未設定時顯示為「現金」；轉帳時為轉出帳戶 */
  accountId?: string;
  /** 若為固定收支自動帶入，存對應 RecurringItem.id；使用者編輯/刪除後會脫離或加入 skip */
  recurringId?: string;
  /** 對應年度預算項目 id；有值時不計入「日常已花」，僅在年預算頁顯示實際 */
  annualBudgetEntryId?: string;
  /** 僅轉帳：轉入帳戶 ID */
  toAccountId?: string;
  /** 僅轉帳：轉入端金額（轉入帳戶幣別） */
  transferAmount?: number;
  createdAt: string; // ISO 8601
}

/** 使用者刪除或編輯過的固定收支發生日，不再自動帶入 */
export interface RecurringSkipItem {
  recurringId: string;
  date: string; // YYYY-MM-DD
}

/** 固定收支週期 */
export type RecurringRepeat = "monthly" | "weekly";

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

/** 每月固定/預估支出項目（投資、家用等；金額為當月預估） */
export interface MonthlyFixedItem {
  id: string;
  label: string;
  /** 選填，綁定支出類別以計算「預估 vs 當月已發生」 */
  categoryKey?: string;
  /** 當月預估金額 */
  estimatedAmount: number;
  sortOrder: number;
}

/** 年度預算項目：某年某月、類型、類別、預計金額；可選項目名稱（如汽車保養）以區分同類別不同用途 */
export interface AnnualBudgetEntry {
  id: string;
  year: number;
  month: number; // 1-12
  type: TransactionType;
  categoryKey: string;
  /** 選填，區分同類別不同項目，如「汽車保養」「年終獎金」 */
  label?: string;
  estimatedAmount: number;
  sortOrder: number;
}

/** 預算設定：月收入預設、平日/假日權重、視為固定支出的類別（日常=排除這些） */
export interface BudgetSettings {
  /** 未記帳時使用的預設月收入 */
  defaultMonthlyIncome: number;
  /** 平日權重（用於剩餘日預算分配） */
  weekdayWeight: number;
  /** 假日權重（週六日等） */
  weekendWeight: number;
  /** 視為「固定/投資」的支出類別 key，這些不計入「日常已花」 */
  fixedExpenseCategoryKeys: string[];
}
