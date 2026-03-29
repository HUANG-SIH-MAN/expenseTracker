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
  /** 在記帳時隱藏此帳戶（餘額頁仍顯示） */
  isHidden?: boolean;
  /** 已刪除：不出現在新增記帳選單，但舊紀錄仍可顯示帳戶名稱 */
  isDeleted?: boolean;
  /** 低餘額警示門檻；有值時餘額低於此數字即發推播通知 */
  lowBalanceThreshold?: number;
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
  /** 已刪除：不出現在新增記帳選項，但舊紀錄仍可解析名稱 */
  deleted?: boolean;
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
  /** 對應每月固定項目 id；有值時不計入「日常已花」，僅在月預算頁顯示實際 */
  monthlyFixedItemId?: string;
  /** 僅轉帳：轉入帳戶 ID */
  toAccountId?: string;
  /** 僅轉帳：轉入端金額（轉入帳戶幣別） */
  transferAmount?: number;
  /** 系統自動建立（如信用卡自動扣款） */
  isSystemGenerated?: boolean;
  /** 系統建立類型 */
  systemGeneratedType?: "credit_card_autopay" | "cash_topup";
  /** 鎖定原因（鎖定後不可編輯/刪除） */
  lockedReason?: "credit_card_autopay" | "cash_topup";
  /**
   * 年費分攤月數；有值時此交易金額在預算計算中平均分攤到 N 個月。
   * 付款當月為第一個月（含餘數），後續 N-1 個月各為 floor(amount/N)。
   */
  amortizationMonths?: number;
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
  /** 當月預估金額（主幣別 TWD） */
  estimatedAmount: number;
  /** 原始幣別（預設 TWD；設為 USD 時以 originalAmount 換算） */
  currency?: CurrencyCode;
  /** 原始幣別金額（僅 currency !== primaryCurrency 時有意義） */
  originalAmount?: number;
  /** 連結的固定收支項目 id；有值時金額跟著 RecurringItem 走 */
  recurringItemId?: string;
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
}

/** 遇假日（週末）時的日期調整方式 */
export type HolidayAdjust = 'none' | 'next_workday' | 'prev_workday';

/** 信用卡自動扣款規則 */
export interface CreditCardAutoPayRule {
  id: string;
  creditCardAccountId: string;
  payFromAccountId: string;
  statementDay: number;
  paymentDay: number;
  holidayAdjust: HolidayAdjust;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isEnabled: boolean;
  deletedAt?: string; // ISO 8601
  deleteReason?: "source_account_deleted" | "credit_card_account_deleted";
}

/** 現金自動補充規則：帳戶餘額低於門檻時，自動從來源帳戶補充 */
export interface CashTopUpRule {
  id: string;
  /** 被補充的帳戶（通常為現金） */
  targetAccountId: string;
  /** 提款來源帳戶 */
  sourceAccountId: string;
  /** 低於此餘額時觸發補充 */
  threshold: number;
  /** 每次補充金額 */
  topUpAmount: number;
  isEnabled: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** 轉帳模板中的附加交易（收入或支出） */
export interface TransferTemplateLinkedTx {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  accountId?: string;
  note?: string;
}

/** 轉帳模板：儲值時自動帶入轉帳欄位並建立附加交易 */
export interface TransferTemplate {
  id: string;
  name: string;
  fromAccountId?: string;
  toAccountId?: string;
  defaultAmount?: number;
  linkedTransactions: TransferTemplateLinkedTx[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** 自動扣款執行紀錄 */
export interface AutoPayExecutionLog {
  id: string;
  ruleId: string;
  scheduledPaymentDate: string; // YYYY-MM-DD
  status: "created" | "skipped" | "failed";
  attempt: number;
  createdTransactionId?: string;
  detail?: string;
  executedAt: string; // ISO 8601
}
