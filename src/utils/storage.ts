/**
 * 依執行環境選擇儲存方式：Native 使用 SQLite，Web 使用 AsyncStorage
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import { getDb } from "../db";
import { STORAGE_KEYS } from "../constants";
import type {
  Account,
  AnnualBudgetEntry,
  BudgetSettings,
  CategoryItem,
  CurrencyCode,
  CurrencyOption,
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
  BUDGET_SETTINGS_KEY_PREFIX,
  BUILT_IN_CURRENCY_CODES,
  CURRENCY_LABELS,
} from "../constants";

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = "TWD";
const SETTINGS_KEY_ONBOARDING = "hasCompletedOnboarding";
const SETTINGS_KEY_PRIMARY_CURRENCY = "primaryCurrency";
const SETTINGS_KEY_MIGRATED = "migratedFromAsyncStorage";
const BUDGET_SETTINGS_KEY = `${BUDGET_SETTINGS_KEY_PREFIX}settings`;

let migrationPromise: Promise<void> | null = null;

async function getSetting(
  db: SQLite.SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

async function setSetting(
  db: SQLite.SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    key,
    value,
  );
}

async function runMigrationFromAsyncStorageIfNeeded(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const migrated = await getSetting(db, SETTINGS_KEY_MIGRATED);
  if (migrated === "true") return;

  const [
    onboardingRaw,
    transactionsRaw,
    categoriesRaw,
    recurringRaw,
    recurringSkipRaw,
  ] = await Promise.all([
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
    await setSetting(db, SETTINGS_KEY_MIGRATED, "true");
    return;
  }

  if (onboardingRaw != null) {
    try {
      const data = JSON.parse(onboardingRaw) as OnboardingData;
      if (data?.hasCompletedOnboarding === true) {
        await setSetting(db, SETTINGS_KEY_ONBOARDING, "true");
        await setSetting(
          db,
          SETTINGS_KEY_PRIMARY_CURRENCY,
          data.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY,
        );
        await db.runAsync("DELETE FROM accounts");
        for (const a of data.accounts ?? []) {
          const currency = (a as Account).currency ?? "TWD";
          await db.runAsync(
            "INSERT INTO accounts (id, name, initial_balance, currency) VALUES (?, ?, ?, ?)",
            a.id,
            a.name,
            a.initialBalance,
            currency,
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
        for (const t of list) {
          await db.runAsync(
            "INSERT OR REPLACE INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, to_account_id, transfer_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            t.id,
            t.type,
            t.amount,
            t.date,
            t.category,
            t.note ?? null,
            t.accountId ?? null,
            t.recurringId ?? null,
            (t as Transaction).annualBudgetEntryId ?? null,
            (t as Transaction).toAccountId ?? null,
            (t as Transaction).transferAmount ?? null,
            t.createdAt,
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
        await db.runAsync("DELETE FROM categories");
        let sortOrder = 0;
        for (const c of data.expense) {
          await db.runAsync(
            "INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
            "expense",
            c.key,
            c.label,
            c.icon,
            sortOrder++,
          );
        }
        sortOrder = 0;
        for (const c of data.income) {
          await db.runAsync(
            "INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
            "income",
            c.key,
            c.label,
            c.icon,
            sortOrder++,
          );
        }
      }
    } catch {
      // ignore
    }
  }

  if (recurringRaw != null && recurringRaw.length > 0) {
    try {
      const list = JSON.parse(recurringRaw) as RecurringItem[];
      if (Array.isArray(list) && list.length > 0) {
        await db.runAsync("DELETE FROM recurring");
        for (const r of list) {
          await db.runAsync(
            "INSERT INTO recurring (id, type, amount, category, note, account_id, repeat, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            r.id,
            r.type,
            r.amount,
            r.category,
            r.note ?? null,
            r.accountId ?? null,
            r.repeat,
            r.day,
            r.createdAt,
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
        for (const x of list) {
          await db.runAsync(
            "INSERT OR IGNORE INTO recurring_skip (recurring_id, date) VALUES (?, ?)",
            x.recurringId,
            x.date,
          );
        }
      }
    } catch {
      // ignore
    }
  }

  await setSetting(db, SETTINGS_KEY_MIGRATED, "true");
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.ONBOARDING,
    STORAGE_KEYS.TRANSACTIONS,
    STORAGE_KEYS.CATEGORIES,
    STORAGE_KEYS.RECURRING,
    STORAGE_KEYS.RECURRING_SKIP,
  ]);
}

async function ensureMigrationDone(db: SQLite.SQLiteDatabase): Promise<void> {
  if (migrationPromise == null) {
    migrationPromise = runMigrationFromAsyncStorageIfNeeded(db);
  }
  await migrationPromise;
}

// --- Onboarding / 帳戶 / 主要貨幣 ---

export async function getOnboardingData(): Promise<OnboardingData | null> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const hasCompleted = await getSetting(db, SETTINGS_KEY_ONBOARDING);
    if (hasCompleted !== "true") return null;
    const primaryCurrency = (await getSetting(
      db,
      SETTINGS_KEY_PRIMARY_CURRENCY,
    )) as CurrencyCode | null;
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      initial_balance: number;
      currency: string;
    }>("SELECT id, name, initial_balance, currency FROM accounts ORDER BY id");
    const accounts: Account[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      initialBalance: r.initial_balance,
      currency: (r.currency as CurrencyCode) || "TWD",
    }));
    return {
      hasCompletedOnboarding: true,
      accounts,
      primaryCurrency: primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY,
    };
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingData;
    if (parsed?.accounts != null) {
      parsed.accounts = parsed.accounts.map((a) => ({
        ...a,
        currency: a.currency ?? "TWD",
      }));
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setOnboardingComplete(data: {
  accounts: Account[];
  primaryCurrency: CurrencyCode;
}): Promise<void> {
  const db = await getDb();
  if (db) {
    await setSetting(db, SETTINGS_KEY_ONBOARDING, "true");
    await setSetting(db, SETTINGS_KEY_PRIMARY_CURRENCY, data.primaryCurrency);
    await db.runAsync("DELETE FROM accounts");
    for (const a of data.accounts) {
      await db.runAsync(
        "INSERT INTO accounts (id, name, initial_balance, currency) VALUES (?, ?, ?, ?)",
        a.id,
        a.name,
        a.initialBalance,
        a.currency ?? "TWD",
      );
    }
    return;
  }
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

// --- 自訂幣別 ---

export interface CustomCurrencyItem {
  code: string;
  label: string;
}

export async function getCustomCurrencies(): Promise<CustomCurrencyItem[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const raw = await getSetting(db, STORAGE_KEYS.CUSTOM_CURRENCIES);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as CustomCurrencyItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_CURRENCIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomCurrencyItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCustomCurrencies(
  items: CustomCurrencyItem[],
): Promise<void> {
  const db = await getDb();
  if (db) {
    await setSetting(db, STORAGE_KEYS.CUSTOM_CURRENCIES, JSON.stringify(items));
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.CUSTOM_CURRENCIES,
    JSON.stringify(items),
  );
}

const BUILT_IN_SET = new Set<string>(BUILT_IN_CURRENCY_CODES);

export async function getCurrencyOptions(): Promise<CurrencyOption[]> {
  const builtIn: CurrencyOption[] = BUILT_IN_CURRENCY_CODES.map((code) => ({
    code: code as string,
    label: CURRENCY_LABELS[code] ?? code,
    isBuiltIn: true,
  }));
  const custom = await getCustomCurrencies();
  for (const { code, label } of custom) {
    const c = code.trim().toUpperCase();
    if (!c || BUILT_IN_SET.has(c)) continue;
    builtIn.push({
      code: c,
      label: label.trim() || c,
      isBuiltIn: false,
    });
  }
  return builtIn;
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
  annual_budget_entry_id: string | null;
  to_account_id: string | null;
  transfer_amount: number | null;
  created_at: string;
}

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    type: r.type as Transaction["type"],
    amount: r.amount,
    date: r.date,
    category: r.category,
    note: r.note ?? undefined,
    accountId: r.account_id ?? undefined,
    recurringId: r.recurring_id ?? undefined,
    annualBudgetEntryId: r.annual_budget_entry_id ?? undefined,
    toAccountId: r.to_account_id ?? undefined,
    transferAmount: r.transfer_amount ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getStoredTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<TransactionRow>(
      "SELECT id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, to_account_id, transfer_amount, created_at FROM transactions ORDER BY date, created_at",
    );
    return rows.map(rowToTransaction);
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM transactions");
    for (const t of transactions) {
      await db.runAsync(
        "INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, to_account_id, transfer_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        t.id,
        t.type,
        t.amount,
        t.date,
        t.category,
        t.note ?? null,
        t.accountId ?? null,
        t.recurringId ?? null,
        t.annualBudgetEntryId ?? null,
        t.toAccountId ?? null,
        t.transferAmount ?? null,
        t.createdAt,
      );
    }
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.TRANSACTIONS,
    JSON.stringify(transactions),
  );
}

export async function addTransaction(transaction: Transaction): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      "INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, to_account_id, transfer_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      transaction.id,
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.category,
      transaction.note ?? null,
      transaction.accountId ?? null,
      transaction.recurringId ?? null,
      transaction.annualBudgetEntryId ?? null,
      transaction.toAccountId ?? null,
      transaction.transferAmount ?? null,
      transaction.createdAt,
    );
    return;
  }
  const list = await getStoredTransactions();
  list.push(transaction);
  await saveTransactions(list);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    const row = await db.getFirstAsync<{
      recurring_id: string | null;
      date: string;
    }>("SELECT recurring_id, date FROM transactions WHERE id = ?", id);
    if (row?.recurring_id != null) {
      await addRecurringSkip(row.recurring_id, row.date);
    }
    await db.runAsync("DELETE FROM transactions WHERE id = ?", id);
    return;
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync(
      "UPDATE transactions SET type = ?, amount = ?, date = ?, category = ?, note = ?, account_id = ?, recurring_id = ?, annual_budget_entry_id = ?, to_account_id = ?, transfer_amount = ?, created_at = ? WHERE id = ?",
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.category,
      transaction.note ?? null,
      transaction.accountId ?? null,
      transaction.recurringId ?? null,
      transaction.annualBudgetEntryId ?? null,
      transaction.toAccountId ?? null,
      transaction.transferAmount ?? null,
      transaction.createdAt,
      transaction.id,
    );
    return;
  }
  const list = await getStoredTransactions();
  const index = list.findIndex((t) => t.id === transaction.id);
  if (index < 0) return;
  const next = [...list];
  next[index] = transaction;
  await saveTransactions(next);
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
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<CategoryRow>(
      "SELECT kind, key, label, icon, sort_order FROM categories ORDER BY kind, sort_order, id",
    );
    const expense = rows
      .filter((r) => r.kind === "expense")
      .map(rowToCategoryItem);
    const income = rows.filter((r) => r.kind === "income").map(rowToCategoryItem);
    if (expense.length === 0 || income.length === 0) return null;
    return { expense, income };
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM categories");
    let sortOrder = 0;
    for (const c of data.expense) {
      await db.runAsync(
        "INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
        "expense",
        c.key,
        c.label,
        c.icon,
        sortOrder++,
      );
    }
    sortOrder = 0;
    for (const c of data.income) {
      await db.runAsync(
        "INSERT INTO categories (kind, key, label, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
        "income",
        c.key,
        c.label,
        c.icon,
        sortOrder++,
      );
    }
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data));
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
    type: r.type as RecurringItem["type"],
    amount: r.amount,
    category: r.category,
    note: r.note ?? undefined,
    accountId: r.account_id ?? undefined,
    repeat: r.repeat as RecurringItem["repeat"],
    day: r.day,
    createdAt: r.created_at,
  };
}

export async function getStoredRecurring(): Promise<RecurringItem[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<RecurringRow>(
      "SELECT id, type, amount, category, note, account_id, repeat, day, created_at FROM recurring ORDER BY created_at",
    );
    return rows.map(rowToRecurringItem);
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM recurring");
    for (const r of items) {
      await db.runAsync(
        "INSERT INTO recurring (id, type, amount, category, note, account_id, repeat, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        r.id,
        r.type,
        r.amount,
        r.category,
        r.note ?? null,
        r.accountId ?? null,
        r.repeat,
        r.day,
        r.createdAt,
      );
    }
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.RECURRING, JSON.stringify(items));
}

export async function getStoredRecurringSkipList(): Promise<
  RecurringSkipItem[]
> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<{ recurring_id: string; date: string }>(
      "SELECT recurring_id, date FROM recurring_skip",
    );
    return rows.map((r) => ({ recurringId: r.recurring_id, date: r.date }));
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM recurring_skip");
    for (const x of items) {
      await db.runAsync(
        "INSERT INTO recurring_skip (recurring_id, date) VALUES (?, ?)",
        x.recurringId,
        x.date,
      );
    }
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.RECURRING_SKIP,
    JSON.stringify(items),
  );
}

export async function addRecurringSkip(
  recurringId: string,
  date: string,
): Promise<void> {
  const db = await getDb();
  if (db) {
    const existing = await db.getFirstAsync(
      "SELECT 1 FROM recurring_skip WHERE recurring_id = ? AND date = ?",
      recurringId,
      date,
    );
    if (existing != null) return;
    await db.runAsync(
      "INSERT INTO recurring_skip (recurring_id, date) VALUES (?, ?)",
      recurringId,
      date,
    );
    return;
  }
  const list = await getStoredRecurringSkipList();
  if (list.some((x) => x.recurringId === recurringId && x.date === date))
    return;
  list.push({ recurringId, date });
  await saveRecurringSkipList(list);
}

// --- 預算：月固定/預估支出 ---

interface MonthlyFixedRow {
  id: string;
  label: string;
  category_key: string | null;
  estimated_amount: number;
  sort_order: number;
}

function rowToMonthlyFixedItem(r: MonthlyFixedRow): MonthlyFixedItem {
  return {
    id: r.id,
    label: r.label,
    categoryKey: r.category_key ?? undefined,
    estimatedAmount: r.estimated_amount,
    sortOrder: r.sort_order,
  };
}

export async function getMonthlyFixedItems(): Promise<MonthlyFixedItem[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<MonthlyFixedRow>(
      "SELECT id, label, category_key, estimated_amount, sort_order FROM monthly_fixed_items ORDER BY sort_order, id",
    );
    return rows.map(rowToMonthlyFixedItem);
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM monthly_fixed_items");
    for (const item of items) {
      await db.runAsync(
        "INSERT INTO monthly_fixed_items (id, label, category_key, estimated_amount, sort_order) VALUES (?, ?, ?, ?, ?)",
        item.id,
        item.label,
        item.categoryKey ?? null,
        item.estimatedAmount,
        item.sortOrder,
      );
    }
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.MONTHLY_FIXED_ITEMS,
    JSON.stringify(items),
  );
}

// --- 預算設定 ---

export async function getBudgetSettings(): Promise<BudgetSettings> {
  const defaults = {
    defaultMonthlyIncome: 0,
    weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
    weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
    fixedExpenseCategoryKeys: [] as string[],
  };
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const raw = await getSetting(db, BUDGET_SETTINGS_KEY);
    if (raw == null || raw === "") return defaults;
    try {
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
      return defaults;
    }
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.BUDGET_SETTINGS);
    if (!raw) return defaults;
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
    return defaults;
  }
}

export async function saveBudgetSettings(
  settings: BudgetSettings,
): Promise<void> {
  const db = await getDb();
  if (db) {
    await setSetting(db, BUDGET_SETTINGS_KEY, JSON.stringify(settings));
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.BUDGET_SETTINGS,
    JSON.stringify(settings),
  );
}

// --- 匯率（總資產換算用）---

export interface ExchangeRatesData {
  rates: Record<string, number>;
  updatedAt: string;
}

export async function getExchangeRates(): Promise<ExchangeRatesData> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<{
      currency_code: string;
      rate_to_primary: number;
      updated_at: string;
    }>("SELECT currency_code, rate_to_primary, updated_at FROM exchange_rates");
    const rates: Record<string, number> = {};
    let updatedAt = "";
    for (const r of rows) {
      rates[r.currency_code] = r.rate_to_primary;
      if (r.updated_at > updatedAt) updatedAt = r.updated_at;
    }
    return { rates, updatedAt };
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.EXCHANGE_RATES);
    if (!raw) return { rates: {}, updatedAt: "" };
    const parsed = JSON.parse(raw) as ExchangeRatesData;
    return {
      rates: parsed?.rates ?? {},
      updatedAt: parsed?.updatedAt ?? "",
    };
  } catch {
    return { rates: {}, updatedAt: "" };
  }
}

export async function saveExchangeRates(
  rates: Record<string, number>,
): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM exchange_rates");
    const now = new Date().toISOString();
    for (const [code, rate] of Object.entries(rates)) {
      await db.runAsync(
        "INSERT INTO exchange_rates (currency_code, rate_to_primary, updated_at) VALUES (?, ?, ?)",
        code,
        rate,
        now,
      );
    }
    return;
  }
  const data: ExchangeRatesData = {
    rates,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(
    STORAGE_KEYS.EXCHANGE_RATES,
    JSON.stringify(data),
  );
}

// --- 年度預算項目 ---

interface AnnualBudgetEntryRow {
  id: string;
  year: number;
  month: number;
  type: string;
  category_key: string;
  label: string | null;
  estimated_amount: number;
  sort_order: number;
}

function rowToAnnualBudgetEntry(r: AnnualBudgetEntryRow): AnnualBudgetEntry {
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    type: r.type as AnnualBudgetEntry["type"],
    categoryKey: r.category_key,
    label: r.label ?? undefined,
    estimatedAmount: r.estimated_amount,
    sortOrder: r.sort_order,
  };
}

export async function getAnnualBudgetEntries(
  year: number,
): Promise<AnnualBudgetEntry[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<AnnualBudgetEntryRow>(
      "SELECT id, year, month, type, category_key, label, estimated_amount, sort_order FROM annual_budget_entries WHERE year = ? ORDER BY month, sort_order, id",
      year,
    );
    return rows.map(rowToAnnualBudgetEntry);
  }
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
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM annual_budget_entries WHERE year = ?", year);
    for (const item of items) {
      await db.runAsync(
        "INSERT INTO annual_budget_entries (id, year, month, type, category_key, label, estimated_amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        item.id,
        item.year,
        item.month,
        item.type,
        item.categoryKey,
        item.label ?? null,
        item.estimatedAmount,
        item.sortOrder,
      );
    }
    return;
  }
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
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    await db.runAsync("DELETE FROM transactions");
    await db.runAsync("DELETE FROM recurring_skip");
    await db.runAsync("DELETE FROM recurring");
    await db.runAsync("DELETE FROM monthly_fixed_items");
    await db.runAsync("DELETE FROM annual_budget_entries");
    await db.runAsync("DELETE FROM exchange_rates");
    await db.runAsync("DELETE FROM categories");
    await db.runAsync("DELETE FROM accounts");
    await setSetting(db, SETTINGS_KEY_ONBOARDING, "false");
    await setSetting(db, STORAGE_KEYS.CUSTOM_CURRENCIES, "[]");
    await saveBudgetSettings({
      defaultMonthlyIncome: 0,
      weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
      weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
      fixedExpenseCategoryKeys: [],
    });
    return;
  }
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
  await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_CURRENCIES);
}

const MIN_DAY = 1;
const MAX_DAY_MONTH = 28;

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
  if (item.repeat === "monthly") {
    const dayOfMonth = Math.min(
      Math.max(MIN_DAY, item.day),
      MAX_DAY_MONTH,
    );
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
