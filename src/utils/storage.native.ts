/**
 * Native (iOS/Android)：使用 SQLite 讀寫導覽、帳戶與交易
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db';
import { STORAGE_KEYS } from '../constants';
import type {
  Account,
  CategoryItem,
  CurrencyCode,
  OnboardingData,
  RecurringItem,
  RecurringSkipItem,
  StoredCategories,
  Transaction,
} from '../types';

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = 'TWD';
const SETTINGS_KEY_ONBOARDING = 'hasCompletedOnboarding';
const SETTINGS_KEY_PRIMARY_CURRENCY = 'primaryCurrency';
const SETTINGS_KEY_MIGRATED = 'migratedFromAsyncStorage';

let migrationPromise: Promise<void> | null = null;

/** 僅執行一次：若 AsyncStorage 有舊資料則寫入 SQLite 並標記已遷移 */
async function runMigrationFromAsyncStorageIfNeeded(): Promise<void> {
  await getDb();
  const migrated = await getSetting(SETTINGS_KEY_MIGRATED);
  if (migrated === 'true') return;

  const [onboardingRaw, transactionsRaw, categoriesRaw, recurringRaw, recurringSkipRaw] =
    await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
      AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS),
      AsyncStorage.getItem(STORAGE_KEYS.CATEGORIES),
      AsyncStorage.getItem(STORAGE_KEYS.RECURRING),
      AsyncStorage.getItem(STORAGE_KEYS.RECURRING_SKIP),
    ]);

  const hasAny =
    onboardingRaw != null ||
    (transactionsRaw != null && transactionsRaw.length > 0) ||
    (categoriesRaw != null && categoriesRaw.length > 0) ||
    (recurringRaw != null && recurringRaw.length > 0) ||
    (recurringSkipRaw != null && recurringSkipRaw.length > 0);

  if (!hasAny) {
    await setSetting(SETTINGS_KEY_MIGRATED, 'true');
    return;
  }

  if (onboardingRaw != null) {
    try {
      const data = JSON.parse(onboardingRaw) as OnboardingData;
      if (data?.hasCompletedOnboarding === true) {
        await setSetting(SETTINGS_KEY_ONBOARDING, 'true');
        await setSetting(
          SETTINGS_KEY_PRIMARY_CURRENCY,
          data.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY
        );
        const db = await getDb();
        await db.runAsync('DELETE FROM accounts');
        for (const a of data.accounts ?? []) {
          await db.runAsync(
            'INSERT INTO accounts (id, name, initial_balance) VALUES (?, ?, ?)',
            a.id,
            a.name,
            a.initialBalance
          );
        }
      }
    } catch {
      // ignore parse error
    }
  }

  if (transactionsRaw != null && transactionsRaw.length > 0) {
    try {
      const list = JSON.parse(transactionsRaw) as Transaction[];
      if (Array.isArray(list) && list.length > 0) {
        const db = await getDb();
        for (const t of list) {
          await db.runAsync(
            'INSERT OR REPLACE INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            t.id,
            t.type,
            t.amount,
            t.date,
            t.category,
            t.note ?? null,
            t.accountId ?? null,
            t.recurringId ?? null,
            t.createdAt
          );
        }
      }
    } catch {
      // ignore
    }
  }

  if (categoriesRaw != null && categoriesRaw.length > 0) {
    try {
      const data = JSON.parse(categoriesRaw) as StoredCategories;
      if (
        data?.expense != null &&
        Array.isArray(data.expense) &&
        data?.income != null &&
        Array.isArray(data.income) &&
        data.expense.length > 0 &&
        data.income.length > 0
      ) {
        await saveCategories(data);
      }
    } catch {
      // ignore
    }
  }

  if (recurringRaw != null && recurringRaw.length > 0) {
    try {
      const list = JSON.parse(recurringRaw) as RecurringItem[];
      if (Array.isArray(list) && list.length > 0) {
        const db = await getDb();
        await db.runAsync('DELETE FROM recurring');
        for (const r of list) {
          await db.runAsync(
            'INSERT INTO recurring (id, type, amount, category, note, account_id, repeat, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            r.id,
            r.type,
            r.amount,
            r.category,
            r.note ?? null,
            r.accountId ?? null,
            r.repeat,
            r.day,
            r.createdAt
          );
        }
      }
    } catch {
      // ignore
    }
  }

  if (recurringSkipRaw != null && recurringSkipRaw.length > 0) {
    try {
      const list = JSON.parse(recurringSkipRaw) as RecurringSkipItem[];
      if (Array.isArray(list) && list.length > 0) {
        const db = await getDb();
        for (const x of list) {
          await db.runAsync(
            'INSERT OR IGNORE INTO recurring_skip (recurring_id, date) VALUES (?, ?)',
            x.recurringId,
            x.date
          );
        }
      }
    } catch {
      // ignore
    }
  }

  await setSetting(SETTINGS_KEY_MIGRATED, 'true');
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.ONBOARDING,
    STORAGE_KEYS.TRANSACTIONS,
    STORAGE_KEYS.CATEGORIES,
    STORAGE_KEYS.RECURRING,
    STORAGE_KEYS.RECURRING_SKIP,
  ]);
}

async function ensureMigrationDone(): Promise<void> {
  if (migrationPromise == null) {
    migrationPromise = runMigrationFromAsyncStorageIfNeeded();
  }
  await migrationPromise;
}

// --- Settings 輔助 ---

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value
  );
}

// --- Onboarding / 帳戶 / 主要貨幣 ---

export async function getOnboardingData(): Promise<OnboardingData | null> {
  await ensureMigrationDone();
  const hasCompleted = await getSetting(SETTINGS_KEY_ONBOARDING);
  if (hasCompleted !== 'true') {
    return null;
  }
  const primaryCurrency =
    (await getSetting(SETTINGS_KEY_PRIMARY_CURRENCY)) as CurrencyCode | null;
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; initial_balance: number }>(
    'SELECT id, name, initial_balance FROM accounts ORDER BY id'
  );
  const accounts: Account[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    initialBalance: r.initial_balance,
  }));
  return {
    hasCompletedOnboarding: true,
    accounts,
    primaryCurrency: primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY,
  };
}

export async function setOnboardingComplete(data: {
  accounts: Account[];
  primaryCurrency: CurrencyCode;
}): Promise<void> {
  await setSetting(SETTINGS_KEY_ONBOARDING, 'true');
  await setSetting(SETTINGS_KEY_PRIMARY_CURRENCY, data.primaryCurrency);
  const db = await getDb();
  await db.runAsync('DELETE FROM accounts');
  for (const a of data.accounts) {
    await db.runAsync(
      'INSERT INTO accounts (id, name, initial_balance) VALUES (?, ?, ?)',
      a.id,
      a.name,
      a.initialBalance
    );
  }
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
  currency: CurrencyCode
): Promise<void> {
  const data = await getOnboardingData();
  if (!data?.hasCompletedOnboarding) return;
  await setOnboardingComplete({
    accounts: data.accounts,
    primaryCurrency: currency,
  });
}

// --- 交易 ---

interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  date: string;
  category: string;
  note: string | null;
  account_id: string | null;
  recurring_id: string | null;
  created_at: string;
}

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    type: r.type as Transaction['type'],
    amount: r.amount,
    date: r.date,
    category: r.category,
    note: r.note ?? undefined,
    accountId: r.account_id ?? undefined,
    recurringId: r.recurring_id ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getStoredTransactions(): Promise<Transaction[]> {
  await ensureMigrationDone();
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow>(
    'SELECT id, type, amount, date, category, note, account_id, recurring_id, created_at FROM transactions ORDER BY date, created_at'
  );
  return rows.map(rowToTransaction);
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions');
  for (const t of transactions) {
    await db.runAsync(
      'INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t.id,
      t.type,
      t.amount,
      t.date,
      t.category,
      t.note ?? null,
      t.accountId ?? null,
      t.recurringId ?? null,
      t.createdAt
    );
  }
}

export async function addTransaction(transaction: Transaction): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    transaction.id,
    transaction.type,
    transaction.amount,
    transaction.date,
    transaction.category,
    transaction.note ?? null,
    transaction.accountId ?? null,
    transaction.recurringId ?? null,
    transaction.createdAt
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ recurring_id: string | null; date: string }>(
    'SELECT recurring_id, date FROM transactions WHERE id = ?',
    id
  );
  if (row?.recurring_id != null) {
    await addRecurringSkip(row.recurring_id, row.date);
  }
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE transactions SET type = ?, amount = ?, date = ?, category = ?, note = ?, account_id = ?, recurring_id = ?, created_at = ? WHERE id = ?',
    transaction.type,
    transaction.amount,
    transaction.date,
    transaction.category,
    transaction.note ?? null,
    transaction.accountId ?? null,
    transaction.recurringId ?? null,
    transaction.createdAt,
    transaction.id
  );
}

// --- 類別設定 ---

interface CategoryRow {
  kind: string;
  key: string;
  label: string;
  icon: string;
  sort_order: number;
}

function rowToCategoryItem(r: CategoryRow): CategoryItem {
  return { key: r.key, label: r.label, icon: r.icon };
}

export async function getStoredCategories(): Promise<StoredCategories | null> {
  await ensureMigrationDone();
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT kind, key, label, icon, sort_order FROM categories ORDER BY kind, sort_order, id'
  );
  const expense = rows.filter((r) => r.kind === 'expense').map(rowToCategoryItem);
  const income = rows.filter((r) => r.kind === 'income').map(rowToCategoryItem);
  if (expense.length === 0 || income.length === 0) {
    return null;
  }
  return { expense, income };
}

export async function saveCategories(data: StoredCategories): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categories');
  let sortOrder = 0;
  for (const c of data.expense) {
    await db.runAsync(
      'INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      'expense',
      c.key,
      c.label,
      c.icon,
      sortOrder++
    );
  }
  sortOrder = 0;
  for (const c of data.income) {
    await db.runAsync(
      'INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      'income',
      c.key,
      c.label,
      c.icon,
      sortOrder++
    );
  }
}

// --- 固定收支 ---

interface RecurringRow {
  id: string;
  type: string;
  amount: number;
  category: string;
  note: string | null;
  account_id: string | null;
  repeat: string;
  day: number;
  created_at: string;
}

function rowToRecurringItem(r: RecurringRow): RecurringItem {
  return {
    id: r.id,
    type: r.type as RecurringItem['type'],
    amount: r.amount,
    category: r.category,
    note: r.note ?? undefined,
    accountId: r.account_id ?? undefined,
    repeat: r.repeat as RecurringItem['repeat'],
    day: r.day,
    createdAt: r.created_at,
  };
}

export async function getStoredRecurring(): Promise<RecurringItem[]> {
  await ensureMigrationDone();
  const db = await getDb();
  const rows = await db.getAllAsync<RecurringRow>(
    'SELECT id, type, amount, category, note, account_id, repeat, day, created_at FROM recurring ORDER BY created_at'
  );
  return rows.map(rowToRecurringItem);
}

export async function saveRecurring(items: RecurringItem[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM recurring');
  for (const r of items) {
    await db.runAsync(
      'INSERT INTO recurring (id, type, amount, category, note, account_id, repeat, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.id,
      r.type,
      r.amount,
      r.category,
      r.note ?? null,
      r.accountId ?? null,
      r.repeat,
      r.day,
      r.createdAt
    );
  }
}

// --- 固定收支 skip ---

export async function getStoredRecurringSkipList(): Promise<RecurringSkipItem[]> {
  await ensureMigrationDone();
  const db = await getDb();
  const rows = await db.getAllAsync<{ recurring_id: string; date: string }>(
    'SELECT recurring_id, date FROM recurring_skip'
  );
  return rows.map((r) => ({ recurringId: r.recurring_id, date: r.date }));
}

export async function saveRecurringSkipList(
  items: RecurringSkipItem[]
): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM recurring_skip');
  for (const x of items) {
    await db.runAsync(
      'INSERT INTO recurring_skip (recurring_id, date) VALUES (?, ?)',
      x.recurringId,
      x.date
    );
  }
}

export async function addRecurringSkip(
  recurringId: string,
  date: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync(
    'SELECT 1 FROM recurring_skip WHERE recurring_id = ? AND date = ?',
    recurringId,
    date
  );
  if (existing != null) return;
  await db.runAsync(
    'INSERT INTO recurring_skip (recurring_id, date) VALUES (?, ?)',
    recurringId,
    date
  );
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
  const minDay = 1;
  const maxDayMonth = 28;
  if (item.repeat === 'monthly') {
    const dayOfMonth = Math.min(Math.max(minDay, item.day), maxDayMonth);
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
        keys.push(
          `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        );
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
