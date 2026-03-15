/**
 * 使用 AsyncStorage 讀寫導覽、帳戶與交易
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Account,
  CurrencyCode,
  OnboardingData,
  RecurringItem,
  RecurringSkipItem,
  StoredCategories,
  Transaction,
} from '../types';
import { STORAGE_KEYS } from '../constants';

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = 'TWD';

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

/** 更新已儲存的帳戶列表（用於編輯帳本後寫回） */
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

/** 更新主要貨幣（設定頁編輯用） */
export async function updateStoredPrimaryCurrency(currency: CurrencyCode): Promise<void> {
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

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
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

export async function updateTransaction(transaction: Transaction): Promise<void> {
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

// --- 固定收支 skip（使用者刪除/編輯過的發生日不再自動帶入）---

export async function getStoredRecurringSkipList(): Promise<RecurringSkipItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.RECURRING_SKIP);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecurringSkipItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecurringSkipList(items: RecurringSkipItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.RECURRING_SKIP, JSON.stringify(items));
}

export async function addRecurringSkip(recurringId: string, date: string): Promise<void> {
  const list = await getStoredRecurringSkipList();
  if (list.some((x) => x.recurringId === recurringId && x.date === date)) return;
  list.push({ recurringId, date });
  await saveRecurringSkipList(list);
}

/** 取得某固定收支在 [startDateKey, endDateKey] 內所有應發生的日期（YYYY-MM-DD） */
function getApplicableDateKeys(
  item: RecurringItem,
  startDateKey: string,
  endDateKey: string
): string[] {
  const [sy, sm] = startDateKey.split('-').map(Number);
  const [ey, em] = endDateKey.split('-').map(Number);
  const start = new Date(sy, sm - 1, 1);
  const end = new Date(ey, em - 1, 31);
  const keys: string[] = [];
  if (item.repeat === 'monthly') {
    const dayOfMonth = Math.min(Math.max(1, item.day), 28);
    for (let y = sy; y <= ey; y++) {
      const monthStart = y === sy ? sm : 1;
      const monthEnd = y === ey ? em : 12;
      for (let m = monthStart; m <= monthEnd; m++) {
        const lastDay = new Date(y, m, 0).getDate();
        const d = Math.min(dayOfMonth, lastDay);
        const date = new Date(y, m - 1, d);
        if (date >= start && date <= end) {
          const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (key >= startDateKey && key <= endDateKey) keys.push(key);
        }
      }
    }
  } else {
    const targetDay = item.day;
    const [sYear, sMonth, sDay] = startDateKey.split('-').map(Number);
    const [eYear, eMonth, eDay] = endDateKey.split('-').map(Number);
    const cursor = new Date(sYear, sMonth - 1, sDay);
    const endDate = new Date(eYear, eMonth - 1, eDay);
    while (cursor <= endDate) {
      if (cursor.getDay() === targetDay) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        const d = cursor.getDate();
        keys.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}

/** 將固定收支從「設定當下之後」的應發生日自動填入帳本（已有或已 skip 的不重複建立） */
export async function syncRecurringToTransactions(): Promise<Transaction[]> {
  const { generateId } = await import('./id');
  const [transactions, recurringList, skipList] = await Promise.all([
    getStoredTransactions(),
    getStoredRecurring(),
    getStoredRecurringSkipList(),
  ]);
  const skipSet = new Set(skipList.map((x) => `${x.recurringId}\t${x.date}`));
  const existingSet = new Set(
    transactions
      .filter((t) => t.recurringId != null)
      .map((t) => `${t.recurringId}\t${t.date}`)
  );
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
