/**
 * Web：使用 AsyncStorage 讀寫導覽、帳戶與交易（expo-sqlite 不支援 web）
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Account,
  AnnualBudgetEntry,
  BudgetSettings,
  CurrencyCode,
  MonthlyFixedItem,
  OnboardingData,
  RecurringItem,
  RecurringSkipItem,
  StoredCategories,
  Transaction,
} from "../types";
import {
  BUDGET_DEFAULT_WEEKDAY_WEIGHT,
  BUDGET_DEFAULT_WEEKEND_WEIGHT,
  STORAGE_KEYS,
} from "../constants";

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = "TWD";

export async function getOnboardingData(): Promise<OnboardingData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingData;
    return parsed;
  } catch {
    return null;
  }
}

export async function setOnboardingComplete(data: {
  accounts: Account[];
  primaryCurrency: CurrencyCode;
}): Promise<void> {
  const payload: OnboardingData = {
    hasCompletedOnboarding: true,
    accounts: data.accounts,
    primaryCurrency: data.primaryCurrency,
  };
  await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(payload));
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const data = await getOnboardingData();
  return data?.hasCompletedOnboarding === true;
}

export async function getStoredAccounts(): Promise<Account[]> {
  const data = await getOnboardingData();
  return data?.accounts ?? [];
}

export async function updateStoredAccounts(accounts: Account[]): Promise<void> {
  const data = await getOnboardingData();
  if (!data?.hasCompletedOnboarding) return;
  await setOnboardingComplete({
    accounts,
    primaryCurrency: data.primaryCurrency,
  });
}

export async function getStoredPrimaryCurrency(): Promise<CurrencyCode> {
  const data = await getOnboardingData();
  return data?.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY;
}

export async function updateStoredPrimaryCurrency(
  currency: CurrencyCode,
): Promise<void> {
  const data = await getOnboardingData();
  if (!data?.hasCompletedOnboarding) return;
  await setOnboardingComplete({
    accounts: data.accounts,
    primaryCurrency: currency,
  });
}

// --- 交易 ---

export async function getStoredTransactions(): Promise<Transaction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Transaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTransactions(
  transactions: Transaction[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.TRANSACTIONS,
    JSON.stringify(transactions),
  );
}

export async function addTransaction(transaction: Transaction): Promise<void> {
  const list = await getStoredTransactions();
  list.push(transaction);
  await saveTransactions(list);
}

export async function deleteTransaction(id: string): Promise<void> {
  const list = await getStoredTransactions();
  const found = list.find((t) => t.id === id);
  if (found?.recurringId) {
    await addRecurringSkip(found.recurringId, found.date);
  }
  const next = list.filter((t) => t.id !== id);
  await saveTransactions(next);
}

export async function updateTransaction(
  transaction: Transaction,
): Promise<void> {
  const list = await getStoredTransactions();
  const index = list.findIndex((t) => t.id === transaction.id);
  if (index < 0) return;
  const next = [...list];
  next[index] = transaction;
  await saveTransactions(next);
}

// --- 類別設定 ---

export async function getStoredCategories(): Promise<StoredCategories | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCategories;
    if (
      !Array.isArray(parsed?.expense) ||
      !Array.isArray(parsed?.income) ||
      parsed.expense.length === 0 ||
      parsed.income.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCategories(data: StoredCategories): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data));
}

// --- 固定收支 ---

export async function getStoredRecurring(): Promise<RecurringItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RECURRING);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecurringItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecurring(items: RecurringItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(items));
}

export async function getStoredRecurringSkipList(): Promise<
  RecurringSkipItem[]
> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RECURRING_SKIP);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecurringSkipItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecurringSkipList(
  items: RecurringSkipItem[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.RECURRING_SKIP,
    JSON.stringify(items),
  );
}

export async function addRecurringSkip(
  recurringId: string,
  date: string,
): Promise<void> {
  const list = await getStoredRecurringSkipList();
  if (list.some((x) => x.recurringId === recurringId && x.date === date))
    return;
  list.push({ recurringId, date });
  await saveRecurringSkipList(list);
}

// --- 預算：月固定/預估支出 ---

export async function getMonthlyFixedItems(): Promise<MonthlyFixedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONTHLY_FIXED_ITEMS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MonthlyFixedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMonthlyFixedItems(
  items: MonthlyFixedItem[],
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.MONTHLY_FIXED_ITEMS,
    JSON.stringify(items),
  );
}

// --- 預算設定 ---

export async function getBudgetSettings(): Promise<BudgetSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.BUDGET_SETTINGS);
    if (!raw) {
      return {
        defaultMonthlyIncome: 0,
        weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
        weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
        fixedExpenseCategoryKeys: [],
      };
    }
    const parsed = JSON.parse(raw) as BudgetSettings;
    return {
      defaultMonthlyIncome: Number(parsed.defaultMonthlyIncome) || 0,
      weekdayWeight:
        Number(parsed.weekdayWeight) || BUDGET_DEFAULT_WEEKDAY_WEIGHT,
      weekendWeight:
        Number(parsed.weekendWeight) || BUDGET_DEFAULT_WEEKEND_WEIGHT,
      fixedExpenseCategoryKeys: Array.isArray(parsed.fixedExpenseCategoryKeys)
        ? parsed.fixedExpenseCategoryKeys
        : [],
    };
  } catch {
    return {
      defaultMonthlyIncome: 0,
      weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
      weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
      fixedExpenseCategoryKeys: [],
    };
  }
}

export async function saveBudgetSettings(
  settings: BudgetSettings,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.BUDGET_SETTINGS,
    JSON.stringify(settings),
  );
}

// --- 年度預算項目 ---

export async function getAnnualBudgetEntries(
  year: number,
): Promise<AnnualBudgetEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ANNUAL_BUDGET_ENTRIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, AnnualBudgetEntry[]>;
    const list = parsed[String(year)];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveAnnualBudgetEntries(
  year: number,
  items: AnnualBudgetEntry[],
): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ANNUAL_BUDGET_ENTRIES);
  const data: Record<string, AnnualBudgetEntry[]> = raw
    ? (JSON.parse(raw) as Record<string, AnnualBudgetEntry[]>)
    : {};
  data[String(year)] = items;
  await AsyncStorage.setItem(
    STORAGE_KEYS.ANNUAL_BUDGET_ENTRIES,
    JSON.stringify(data),
  );
}

/**
 * 清除所有用戶輸入的設定與資料（交易、類別、固定收支、預算、年度預算、帳本／導覽），回到未完成導覽狀態。此操作無法復原。
 */
export async function clearAllData(): Promise<void> {
  await saveTransactions([]);
  await saveRecurringSkipList([]);
  await saveRecurring([]);
  await saveMonthlyFixedItems([]);
  await AsyncStorage.removeItem(STORAGE_KEYS.ANNUAL_BUDGET_ENTRIES);
  await saveBudgetSettings({
    defaultMonthlyIncome: 0,
    weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
    weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
    fixedExpenseCategoryKeys: [],
  });
  await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING);
  await AsyncStorage.removeItem(STORAGE_KEYS.CATEGORIES);
}

/** 取得某固定收支在 [startDateKey, endDateKey] 內所有應發生的日期（YYYY-MM-DD） */
function getApplicableDateKeys(
  item: RecurringItem,
  startDateKey: string,
  endDateKey: string,
): string[] {
  const [sy, sm] = startDateKey.split("-").map(Number);
  const [ey, em] = endDateKey.split("-").map(Number);
  const start = new Date(sy, sm - 1, 1);
  const end = new Date(ey, em - 1, 31);
  const keys: string[] = [];
  const minDay = 1;
  const maxDayMonth = 28;
  if (item.repeat === "monthly") {
    const dayOfMonth = Math.min(Math.max(minDay, item.day), maxDayMonth);
    for (let y = sy; y <= ey; y++) {
      const monthStart = y === sy ? sm : 1;
      const monthEnd = y === ey ? em : 12;
      for (let m = monthStart; m <= monthEnd; m++) {
        const lastDay = new Date(y, m, 0).getDate();
        const d = Math.min(dayOfMonth, lastDay);
        const date = new Date(y, m - 1, d);
        if (date >= start && date <= end) {
          const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (key >= startDateKey && key <= endDateKey) keys.push(key);
        }
      }
    }
  } else {
    const targetDay = item.day;
    const [sYear, sMonth, sDay] = startDateKey.split("-").map(Number);
    const [eYear, eMonth, eDay] = endDateKey.split("-").map(Number);
    const cursor = new Date(sYear, sMonth - 1, sDay);
    const endDate = new Date(eYear, eMonth - 1, eDay);
    while (cursor <= endDate) {
      if (cursor.getDay() === targetDay) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        const d = cursor.getDate();
        keys.push(
          `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}

export async function syncRecurringToTransactions(): Promise<Transaction[]> {
  const { generateId } = await import("./id");
  const [transactions, recurringList, skipList] = await Promise.all([
    getStoredTransactions(),
    getStoredRecurring(),
    getStoredRecurringSkipList(),
  ]);
  const skipSet = new Set(skipList.map((x) => `${x.recurringId}\t${x.date}`));
  const existingSet = new Set(
    transactions
      .filter((t) => t.recurringId != null)
      .map((t) => `${t.recurringId}\t${t.date}`),
  );
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const added: Transaction[] = [];
  for (const item of recurringList) {
    const startKey = item.createdAt.slice(0, 10);
    const dateKeys = getApplicableDateKeys(item, startKey, todayKey);
    for (const dateKey of dateKeys) {
      const key = `${item.id}\t${dateKey}`;
      if (skipSet.has(key) || existingSet.has(key)) continue;
      const t: Transaction = {
        id: generateId(),
        type: item.type,
        amount: item.amount,
        date: dateKey,
        category: item.category,
        note: item.note,
        accountId: item.accountId,
        recurringId: item.id,
        createdAt: new Date().toISOString(),
      };
      transactions.push(t);
      added.push(t);
      existingSet.add(key);
    }
  }
  if (added.length > 0) {
    await saveTransactions(transactions);
  }
  return transactions;
}
