/**
 * 依執行環境選擇儲存方式：Native 使用 SQLite，Web 使用 AsyncStorage
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";
import { getDb } from "../db";
import { STORAGE_KEYS } from "../constants";
import { syncCreditCardAutopay } from "./creditCardAutopay";
import { syncCashTopUp } from "./cashTopUp";
import type {
  Account,
  AutoPayExecutionLog,
  AnnualBudgetEntry,
  BudgetSettings,
  CategoryItem,
  CashTopUpRule,
  CreditCardAutoPayRule,
  CurrencyCode,
  CurrencyOption,
  ETFHolding,
  MonthlyFixedItem,
  OnboardingData,
  RecurringItem,
  RecurringSkipItem,
  StockPriceCache,
  StockTransaction,
  StockWatchlistItem,
  StoredCategories,
  Transaction,
  TransferTemplate,
} from "../types";
import {
  BUDGET_DEFAULT_WEEKDAY_WEIGHT,
  BUDGET_DEFAULT_WEEKEND_WEIGHT,
  BUDGET_SETTINGS_KEY_PREFIX,
  BUILT_IN_CURRENCY_CODES,
  CURRENCY_LABELS,
} from "../constants";

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = "TWD";
const SQLITE_TRUE = 1;
const SQLITE_FALSE = 0;
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
            "INSERT INTO accounts (id, name, initial_balance, currency, is_hidden, is_deleted, low_balance_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)",
            a.id,
            a.name,
            a.initialBalance,
            currency,
            (a as Account).isHidden === true ? SQLITE_TRUE : SQLITE_FALSE,
            (a as Account).isDeleted === true ? SQLITE_TRUE : SQLITE_FALSE,
            (a as Account).lowBalanceThreshold ?? null,
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
            "INSERT OR REPLACE INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, monthly_fixed_item_id, to_account_id, transfer_amount, is_system_generated, system_generated_type, locked_reason, amortization_months, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            t.id,
            t.type,
            t.amount,
            t.date,
            t.category,
            t.note ?? null,
            t.accountId ?? null,
            t.recurringId ?? null,
            (t as Transaction).annualBudgetEntryId ?? null,
            (t as Transaction).monthlyFixedItemId ?? null,
            (t as Transaction).toAccountId ?? null,
            (t as Transaction).transferAmount ?? null,
            (t as Transaction).isSystemGenerated === true ? SQLITE_TRUE : SQLITE_FALSE,
            (t as Transaction).systemGeneratedType ?? null,
            (t as Transaction).lockedReason ?? null,
            (t as Transaction).amortizationMonths ?? null,
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
            "INSERT INTO categories (kind, key, label, icon, sort_order, default_account_id) VALUES (?, ?, ?, ?, ?, ?)",
            "expense",
            c.key,
            c.label,
            c.icon,
            sortOrder++,
            c.defaultAccountId ?? null,
          );
        }
        sortOrder = 0;
        for (const c of data.income) {
          await db.runAsync(
            "INSERT INTO categories (kind, key, label, icon, sort_order, default_account_id) VALUES (?, ?, ?, ?, ?, ?)",
            "income",
            c.key,
            c.label,
            c.icon,
            sortOrder++,
            c.defaultAccountId ?? null,
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
      is_hidden: number;
      is_deleted: number;
      low_balance_threshold: number | null;
    }>("SELECT id, name, initial_balance, currency, is_hidden, is_deleted, low_balance_threshold FROM accounts ORDER BY id");
    const accounts: Account[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      initialBalance: r.initial_balance,
      currency: (r.currency as CurrencyCode) || "TWD",
      isHidden: r.is_hidden === SQLITE_TRUE ? true : undefined,
      isDeleted: r.is_deleted === SQLITE_TRUE ? true : undefined,
      lowBalanceThreshold: r.low_balance_threshold ?? undefined,
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
        "INSERT INTO accounts (id, name, initial_balance, currency, is_hidden, is_deleted, low_balance_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)",
        a.id,
        a.name,
        a.initialBalance,
        a.currency ?? "TWD",
        a.isHidden === true ? SQLITE_TRUE : SQLITE_FALSE,
        a.isDeleted === true ? SQLITE_TRUE : SQLITE_FALSE,
        a.lowBalanceThreshold ?? null,
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
  monthly_fixed_item_id: string | null;
  to_account_id: string | null;
  transfer_amount: number | null;
  is_system_generated: number;
  system_generated_type: string | null;
  locked_reason: string | null;
  amortization_months: number | null;
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
    monthlyFixedItemId: r.monthly_fixed_item_id ?? undefined,
    toAccountId: r.to_account_id ?? undefined,
    transferAmount: r.transfer_amount ?? undefined,
    isSystemGenerated: r.is_system_generated === SQLITE_TRUE,
    systemGeneratedType:
      (r.system_generated_type as Transaction["systemGeneratedType"]) ?? undefined,
    lockedReason: (r.locked_reason as Transaction["lockedReason"]) ?? undefined,
    amortizationMonths: r.amortization_months ?? undefined,
    createdAt: r.created_at,
  };
}

function isLockedCreditCardAutoPayTransaction(input: {
  systemGeneratedType?: string | null;
  lockedReason?: string | null;
}): boolean {
  return (
    input.systemGeneratedType === "credit_card_autopay" ||
    input.lockedReason === "credit_card_autopay"
  );
}

export async function getStoredTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<TransactionRow>(
      "SELECT id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, monthly_fixed_item_id, to_account_id, transfer_amount, is_system_generated, system_generated_type, locked_reason, amortization_months, created_at FROM transactions ORDER BY date, created_at",
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
        "INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, monthly_fixed_item_id, to_account_id, transfer_amount, is_system_generated, system_generated_type, locked_reason, amortization_months, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        t.id,
        t.type,
        t.amount,
        t.date,
        t.category,
        t.note ?? null,
        t.accountId ?? null,
        t.recurringId ?? null,
        t.annualBudgetEntryId ?? null,
        t.monthlyFixedItemId ?? null,
        t.toAccountId ?? null,
        t.transferAmount ?? null,
        t.isSystemGenerated === true ? SQLITE_TRUE : SQLITE_FALSE,
        t.systemGeneratedType ?? null,
        t.lockedReason ?? null,
        t.amortizationMonths ?? null,
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
      "INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, monthly_fixed_item_id, to_account_id, transfer_amount, is_system_generated, system_generated_type, locked_reason, amortization_months, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      transaction.id,
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.category,
      transaction.note ?? null,
      transaction.accountId ?? null,
      transaction.recurringId ?? null,
      transaction.annualBudgetEntryId ?? null,
      transaction.monthlyFixedItemId ?? null,
      transaction.toAccountId ?? null,
      transaction.transferAmount ?? null,
      transaction.isSystemGenerated === true ? SQLITE_TRUE : SQLITE_FALSE,
      transaction.systemGeneratedType ?? null,
      transaction.lockedReason ?? null,
      transaction.amortizationMonths ?? null,
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
      system_generated_type: string | null;
      locked_reason: string | null;
    }>(
      "SELECT recurring_id, date, system_generated_type, locked_reason FROM transactions WHERE id = ?",
      id,
    );
    if (
      row != null &&
      isLockedCreditCardAutoPayTransaction({
        systemGeneratedType: row.system_generated_type,
        lockedReason: row.locked_reason,
      })
    ) {
      throw new Error("Locked autopay transaction cannot be deleted");
    }
    if (row?.recurring_id != null) {
      await addRecurringSkip(row.recurring_id, row.date);
    }
    await db.runAsync("DELETE FROM transactions WHERE id = ?", id);
    return;
  }
  const list = await getStoredTransactions();
  const found = list.find((t) => t.id === id);
  if (
    found != null &&
    isLockedCreditCardAutoPayTransaction({
      systemGeneratedType: found.systemGeneratedType,
      lockedReason: found.lockedReason,
    })
  ) {
    throw new Error("Locked autopay transaction cannot be deleted");
  }
  if (found?.recurringId) {
    await addRecurringSkip(found.recurringId, found.date);
  }
  const next = list.filter((t) => t.id !== id);
  await saveTransactions(next);
}

export async function updateTransaction(
  transaction: Transaction,
): Promise<void> {
  if (
    isLockedCreditCardAutoPayTransaction({
      systemGeneratedType: transaction.systemGeneratedType,
      lockedReason: transaction.lockedReason,
    })
  ) {
    throw new Error("Locked autopay transaction cannot be updated");
  }
  const db = await getDb();
  if (db) {
    const existing = await db.getFirstAsync<{
      system_generated_type: string | null;
      locked_reason: string | null;
    }>(
      "SELECT system_generated_type, locked_reason FROM transactions WHERE id = ?",
      transaction.id,
    );
    if (
      existing != null &&
      isLockedCreditCardAutoPayTransaction({
        systemGeneratedType: existing.system_generated_type,
        lockedReason: existing.locked_reason,
      })
    ) {
      throw new Error("Locked autopay transaction cannot be updated");
    }
    await db.runAsync(
      "UPDATE transactions SET type = ?, amount = ?, date = ?, category = ?, note = ?, account_id = ?, recurring_id = ?, annual_budget_entry_id = ?, monthly_fixed_item_id = ?, to_account_id = ?, transfer_amount = ?, is_system_generated = ?, system_generated_type = ?, locked_reason = ?, amortization_months = ?, created_at = ? WHERE id = ?",
      transaction.type,
      transaction.amount,
      transaction.date,
      transaction.category,
      transaction.note ?? null,
      transaction.accountId ?? null,
      transaction.recurringId ?? null,
      transaction.annualBudgetEntryId ?? null,
      transaction.monthlyFixedItemId ?? null,
      transaction.toAccountId ?? null,
      transaction.transferAmount ?? null,
      transaction.isSystemGenerated === true ? SQLITE_TRUE : SQLITE_FALSE,
      transaction.systemGeneratedType ?? null,
      transaction.lockedReason ?? null,
      transaction.amortizationMonths ?? null,
      transaction.createdAt,
      transaction.id,
    );
    return;
  }
  const list = await getStoredTransactions();
  const index = list.findIndex((t) => t.id === transaction.id);
  if (index < 0) return;
  const existing = list[index];
  if (
    isLockedCreditCardAutoPayTransaction({
      systemGeneratedType: existing.systemGeneratedType,
      lockedReason: existing.lockedReason,
    })
  ) {
    throw new Error("Locked autopay transaction cannot be updated");
  }
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
  default_account_id: string | null;
}

function rowToCategoryItem(r: CategoryRow): CategoryItem {
  const item: CategoryItem = { key: r.key, label: r.label, icon: r.icon };
  if (r.default_account_id != null && r.default_account_id !== "") {
    item.defaultAccountId = r.default_account_id;
  }
  return item;
}

export async function getStoredCategories(): Promise<StoredCategories | null> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<CategoryRow>(
      "SELECT kind, key, label, icon, sort_order, default_account_id FROM categories ORDER BY kind, sort_order, id",
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
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM categories");
      let sortOrder = 0;
      for (const c of data.expense) {
        await db.runAsync(
          "INSERT INTO categories (kind, key, label, icon, sort_order, default_account_id) VALUES (?, ?, ?, ?, ?, ?)",
          "expense",
          c.key,
          c.label,
          c.icon,
          sortOrder++,
          c.defaultAccountId ?? null,
        );
      }
      sortOrder = 0;
      for (const c of data.income) {
        await db.runAsync(
          "INSERT INTO categories (kind, key, label, icon, sort_order, default_account_id) VALUES (?, ?, ?, ?, ?, ?)",
          "income",
          c.key,
          c.label,
          c.icon,
          sortOrder++,
          c.defaultAccountId ?? null,
        );
      }
    });
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
  account_id: string | null;
  estimated_amount: number;
  currency: string | null;
  original_amount: number | null;
  recurring_item_id: string | null;
  sort_order: number;
}

function rowToMonthlyFixedItem(r: MonthlyFixedRow): MonthlyFixedItem {
  return {
    id: r.id,
    label: r.label,
    categoryKey: r.category_key ?? undefined,
    accountId: r.account_id ?? undefined,
    estimatedAmount: r.estimated_amount,
    currency: (r.currency as MonthlyFixedItem['currency']) ?? undefined,
    originalAmount: r.original_amount ?? undefined,
    recurringItemId: r.recurring_item_id ?? undefined,
    sortOrder: r.sort_order,
  };
}

export async function getMonthlyFixedItems(): Promise<MonthlyFixedItem[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<MonthlyFixedRow>(
      "SELECT id, label, category_key, account_id, estimated_amount, currency, original_amount, recurring_item_id, sort_order FROM monthly_fixed_items ORDER BY sort_order, id",
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
        "INSERT INTO monthly_fixed_items (id, label, category_key, account_id, estimated_amount, currency, original_amount, recurring_item_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        item.id,
        item.label,
        item.categoryKey ?? null,
        item.accountId ?? null,
        item.estimatedAmount,
        item.currency ?? null,
        item.originalAmount ?? null,
        item.recurringItemId ?? null,
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

// --- 信用卡自動扣款 ---

interface CreditCardAutoPayRuleRow {
  id: string;
  credit_card_account_id: string;
  pay_from_account_id: string;
  statement_day: number;
  payment_day: number;
  holiday_adjust: string | null;
  created_at: string;
  updated_at: string;
  is_enabled: number;
  deleted_at: string | null;
  delete_reason: string | null;
}

interface AutoPayExecutionLogRow {
  id: string;
  rule_id: string;
  scheduled_payment_date: string;
  status: string;
  attempt: number;
  created_transaction_id: string | null;
  detail: string | null;
  executed_at: string;
}

function rowToCreditCardAutoPayRule(
  row: CreditCardAutoPayRuleRow,
): CreditCardAutoPayRule {
  return {
    id: row.id,
    creditCardAccountId: row.credit_card_account_id,
    payFromAccountId: row.pay_from_account_id,
    statementDay: row.statement_day,
    paymentDay: row.payment_day,
    holidayAdjust: (row.holiday_adjust as CreditCardAutoPayRule["holidayAdjust"]) ?? "none",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isEnabled: row.is_enabled === SQLITE_TRUE,
    deletedAt: row.deleted_at ?? undefined,
    deleteReason:
      (row.delete_reason as CreditCardAutoPayRule["deleteReason"]) ?? undefined,
  };
}

function rowToAutoPayExecutionLog(row: AutoPayExecutionLogRow): AutoPayExecutionLog {
  return {
    id: row.id,
    ruleId: row.rule_id,
    scheduledPaymentDate: row.scheduled_payment_date,
    status: row.status as AutoPayExecutionLog["status"],
    attempt: row.attempt,
    createdTransactionId: row.created_transaction_id ?? undefined,
    detail: row.detail ?? undefined,
    executedAt: row.executed_at,
  };
}

function assertNoDuplicateActiveAutoPayRules(
  rules: CreditCardAutoPayRule[],
): void {
  const activeCardAccountIdSet = new Set<string>();
  for (const rule of rules) {
    if (!rule.isEnabled || rule.deletedAt != null) {
      continue;
    }
    if (activeCardAccountIdSet.has(rule.creditCardAccountId)) {
      throw new Error(
        `Duplicate active credit card autopay rule for account: ${rule.creditCardAccountId}`,
      );
    }
    activeCardAccountIdSet.add(rule.creditCardAccountId);
  }
}

export async function getCreditCardAutoPayRules(): Promise<
  CreditCardAutoPayRule[]
> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<CreditCardAutoPayRuleRow>(
      "SELECT id, credit_card_account_id, pay_from_account_id, statement_day, payment_day, holiday_adjust, created_at, updated_at, is_enabled, deleted_at, delete_reason FROM credit_card_autopay_rules ORDER BY created_at, id",
    );
    return rows.map(rowToCreditCardAutoPayRule);
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CREDIT_CARD_AUTOPAY_RULES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CreditCardAutoPayRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCreditCardAutoPayRules(
  rules: CreditCardAutoPayRule[],
): Promise<void> {
  assertNoDuplicateActiveAutoPayRules(rules);
  const db = await getDb();
  if (db) {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM credit_card_autopay_rules");
      for (const rule of rules) {
        await db.runAsync(
          "INSERT INTO credit_card_autopay_rules (id, credit_card_account_id, pay_from_account_id, statement_day, payment_day, holiday_adjust, created_at, updated_at, is_enabled, deleted_at, delete_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          rule.id,
          rule.creditCardAccountId,
          rule.payFromAccountId,
          rule.statementDay,
          rule.paymentDay,
          rule.holidayAdjust ?? "none",
          rule.createdAt,
          rule.updatedAt,
          rule.isEnabled ? SQLITE_TRUE : SQLITE_FALSE,
          rule.deletedAt ?? null,
          rule.deleteReason ?? null,
        );
      }
    });
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.CREDIT_CARD_AUTOPAY_RULES,
    JSON.stringify(rules),
  );
}

export async function getCreditCardAutoPayExecutionLogs(): Promise<
  AutoPayExecutionLog[]
> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<AutoPayExecutionLogRow>(
      "SELECT id, rule_id, scheduled_payment_date, status, attempt, created_transaction_id, detail, executed_at FROM credit_card_autopay_execution_logs ORDER BY executed_at, id",
    );
    return rows.map(rowToAutoPayExecutionLog);
  }
  try {
    const raw = await AsyncStorage.getItem(
      STORAGE_KEYS.CREDIT_CARD_AUTOPAY_EXECUTION_LOGS,
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutoPayExecutionLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCreditCardAutoPayExecutionLogs(
  logs: AutoPayExecutionLog[],
): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM credit_card_autopay_execution_logs");
      for (const log of logs) {
        await db.runAsync(
          "INSERT INTO credit_card_autopay_execution_logs (id, rule_id, scheduled_payment_date, status, attempt, created_transaction_id, detail, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          log.id,
          log.ruleId,
          log.scheduledPaymentDate,
          log.status,
          log.attempt,
          log.createdTransactionId ?? null,
          log.detail ?? null,
          log.executedAt,
        );
      }
    });
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.CREDIT_CARD_AUTOPAY_EXECUTION_LOGS,
    JSON.stringify(logs),
  );
}

export async function addCreditCardAutoPayExecutionLog(
  log: AutoPayExecutionLog,
): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      "INSERT INTO credit_card_autopay_execution_logs (id, rule_id, scheduled_payment_date, status, attempt, created_transaction_id, detail, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      log.id,
      log.ruleId,
      log.scheduledPaymentDate,
      log.status,
      log.attempt,
      log.createdTransactionId ?? null,
      log.detail ?? null,
      log.executedAt,
    );
    return;
  }
  const currentLogs = await getCreditCardAutoPayExecutionLogs();
  const duplicateIndex = currentLogs.findIndex(
    (item) =>
      item.ruleId === log.ruleId &&
      item.scheduledPaymentDate === log.scheduledPaymentDate &&
      item.attempt === log.attempt,
  );
  if (duplicateIndex >= 0) {
    currentLogs[duplicateIndex] = log;
  } else {
    currentLogs.push(log);
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.CREDIT_CARD_AUTOPAY_EXECUTION_LOGS,
    JSON.stringify(currentLogs),
  );
}

export async function softDeleteCreditCardAutoPayRule(
  ruleId: string,
  reason: NonNullable<CreditCardAutoPayRule["deleteReason"]>,
): Promise<void> {
  const deletedAt = new Date().toISOString();
  const db = await getDb();
  if (db) {
    await db.runAsync(
      "UPDATE credit_card_autopay_rules SET is_enabled = ?, deleted_at = ?, delete_reason = ?, updated_at = ? WHERE id = ?",
      SQLITE_FALSE,
      deletedAt,
      reason,
      deletedAt,
      ruleId,
    );
    return;
  }
  const rules = await getCreditCardAutoPayRules();
  let hasUpdated = false;
  const nextRules = rules.map((rule) => {
    if (rule.id !== ruleId) {
      return rule;
    }
    hasUpdated = true;
    return {
      ...rule,
      isEnabled: false,
      deletedAt,
      deleteReason: reason,
      updatedAt: deletedAt,
    };
  });
  if (!hasUpdated) {
    return;
  }
  await AsyncStorage.setItem(
    STORAGE_KEYS.CREDIT_CARD_AUTOPAY_RULES,
    JSON.stringify(nextRules),
  );
}

export async function syncCreditCardAutopayToTransactions(): Promise<{
  createdCount: number;
}> {
  const { generateId } = await import("./id");
  const [rules, logs, transactions, accounts] = await Promise.all([
    getCreditCardAutoPayRules(),
    getCreditCardAutoPayExecutionLogs(),
    getStoredTransactions(),
    getStoredAccounts(),
  ]);
  const accountIdSet = new Set(accounts.map((item) => item.id));
  const nowIso = new Date().toISOString();

  let hasRuleChanges = false;
  const normalizedRules = rules.map((rule) => {
    if (!rule.isEnabled || rule.deletedAt != null) {
      return rule;
    }
    const hasSourceAccount = accountIdSet.has(rule.payFromAccountId);
    const hasCreditCardAccount = accountIdSet.has(rule.creditCardAccountId);
    if (hasSourceAccount && hasCreditCardAccount) {
      return rule;
    }
    hasRuleChanges = true;
    return {
      ...rule,
      isEnabled: false,
      deletedAt: nowIso,
      deleteReason: (hasSourceAccount
        ? "credit_card_account_deleted"
        : "source_account_deleted") as CreditCardAutoPayRule["deleteReason"],
      updatedAt: nowIso,
    };
  });

  if (hasRuleChanges) {
    await saveCreditCardAutoPayRules(normalizedRules);
  }

  const validRules = normalizedRules.filter(
    (item) => item.isEnabled && item.deletedAt == null,
  );

  const syncResult = syncCreditCardAutopay({
    rules: validRules,
    logs,
    transactions,
    now: new Date(),
    generateId,
  });

  const hasTransactionChanges =
    syncResult.transactions.length !== transactions.length;
  const hasLogChanges = syncResult.logs.length !== logs.length;

  if (hasTransactionChanges || hasLogChanges) {
    await Promise.all([
      hasTransactionChanges ? saveTransactions(syncResult.transactions) : null,
      hasLogChanges ? saveCreditCardAutoPayExecutionLogs(syncResult.logs) : null,
    ]);
  }

  return { createdCount: syncResult.createdCount };
}

// ─── 現金自動補充規則 ───────────────────────────────────────────────────────

interface CashTopUpRuleRow {
  id: string;
  target_account_id: string;
  source_account_id: string;
  threshold: number;
  top_up_amount: number;
  is_enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToCashTopUpRule(row: CashTopUpRuleRow): CashTopUpRule {
  return {
    id: row.id,
    targetAccountId: row.target_account_id,
    sourceAccountId: row.source_account_id,
    threshold: row.threshold,
    topUpAmount: row.top_up_amount,
    isEnabled: row.is_enabled === SQLITE_TRUE,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCashTopUpRules(): Promise<CashTopUpRule[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<CashTopUpRuleRow>(
      "SELECT id, target_account_id, source_account_id, threshold, top_up_amount, is_enabled, created_at, updated_at FROM cash_topup_rules ORDER BY created_at, id",
    );
    return rows.map(rowToCashTopUpRule);
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CASH_TOPUP_RULES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CashTopUpRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCashTopUpRules(rules: CashTopUpRule[]): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM cash_topup_rules");
      for (const rule of rules) {
        await db.runAsync(
          "INSERT INTO cash_topup_rules (id, target_account_id, source_account_id, threshold, top_up_amount, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          rule.id,
          rule.targetAccountId,
          rule.sourceAccountId,
          rule.threshold,
          rule.topUpAmount,
          rule.isEnabled ? SQLITE_TRUE : SQLITE_FALSE,
          rule.createdAt,
          rule.updatedAt,
        );
      }
    });
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.CASH_TOPUP_RULES, JSON.stringify(rules));
}

export async function syncCashTopUpToTransactions(triggerDate?: string): Promise<{ createdCount: number }> {
  const { generateId } = await import("./id");
  const [rules, transactions, accounts] = await Promise.all([
    getCashTopUpRules(),
    getStoredTransactions(),
    getStoredAccounts(),
  ]);
  const accountIdSet = new Set(accounts.map((a) => a.id));
  const nowIso = new Date().toISOString();

  let hasRuleChanges = false;
  const normalizedRules = rules.map((rule) => {
    if (!rule.isEnabled) return rule;
    if (accountIdSet.has(rule.targetAccountId) && accountIdSet.has(rule.sourceAccountId)) {
      return rule;
    }
    hasRuleChanges = true;
    return { ...rule, isEnabled: false, updatedAt: nowIso };
  });
  if (hasRuleChanges) {
    await saveCashTopUpRules(normalizedRules);
  }

  // 若有指定觸發日期（來自交易），用該日期；否則用今天
  const now = triggerDate ? new Date(`${triggerDate}T12:00:00`) : new Date();
  const syncResult = syncCashTopUp({
    rules: normalizedRules.filter((r) => r.isEnabled),
    accounts,
    transactions,
    now,
    generateId,
  });

  for (const transfer of syncResult.newTransfers) {
    await addTransaction(transfer);
  }

  return { createdCount: syncResult.createdCount };
}

// ─── 轉帳模板 ──────────────────────────────────────────────────────────────

const TRANSFER_TEMPLATES_ASYNC_KEY = "transfer_templates";

interface TransferTemplateRow {
  id: string;
  name: string;
  from_account_id: string | null;
  to_account_id: string | null;
  default_amount: number | null;
  linked_transactions: string;
  created_at: string;
  updated_at: string;
}

function rowToTransferTemplate(row: TransferTemplateRow): TransferTemplate {
  let linkedTransactions: TransferTemplate["linkedTransactions"] = [];
  try {
    linkedTransactions = JSON.parse(row.linked_transactions);
  } catch {
    // ignore parse error, default to empty
  }
  return {
    id: row.id,
    name: row.name,
    fromAccountId: row.from_account_id ?? undefined,
    toAccountId: row.to_account_id ?? undefined,
    defaultAmount: row.default_amount ?? undefined,
    linkedTransactions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTransferTemplates(): Promise<TransferTemplate[]> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const rows = await db.getAllAsync<TransferTemplateRow>(
      "SELECT id, name, from_account_id, to_account_id, default_amount, linked_transactions, created_at, updated_at FROM transfer_templates ORDER BY created_at, id",
    );
    return rows.map(rowToTransferTemplate);
  }
  try {
    const raw = await AsyncStorage.getItem(TRANSFER_TEMPLATES_ASYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TransferTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTransferTemplate(
  template: TransferTemplate,
): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      "INSERT OR REPLACE INTO transfer_templates (id, name, from_account_id, to_account_id, default_amount, linked_transactions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      template.id,
      template.name,
      template.fromAccountId ?? null,
      template.toAccountId ?? null,
      template.defaultAmount ?? null,
      JSON.stringify(template.linkedTransactions),
      template.createdAt,
      template.updatedAt,
    );
    return;
  }
  const list = await getTransferTemplates();
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    list[idx] = template;
  } else {
    list.push(template);
  }
  await AsyncStorage.setItem(TRANSFER_TEMPLATES_ASYNC_KEY, JSON.stringify(list));
}

export async function deleteTransferTemplate(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync("DELETE FROM transfer_templates WHERE id = ?", id);
    return;
  }
  const list = await getTransferTemplates();
  const next = list.filter((t) => t.id !== id);
  await AsyncStorage.setItem(TRANSFER_TEMPLATES_ASYNC_KEY, JSON.stringify(next));
}

export async function addTransactionsAtomically(
  transactions: Transaction[],
): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.withTransactionAsync(async () => {
      for (const transaction of transactions) {
        await db.runAsync(
          "INSERT INTO transactions (id, type, amount, date, category, note, account_id, recurring_id, annual_budget_entry_id, monthly_fixed_item_id, to_account_id, transfer_amount, is_system_generated, system_generated_type, locked_reason, amortization_months, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          transaction.id,
          transaction.type,
          transaction.amount,
          transaction.date,
          transaction.category,
          transaction.note ?? null,
          transaction.accountId ?? null,
          transaction.recurringId ?? null,
          transaction.annualBudgetEntryId ?? null,
          transaction.monthlyFixedItemId ?? null,
          transaction.toAccountId ?? null,
          transaction.transferAmount ?? null,
          transaction.isSystemGenerated === true ? SQLITE_TRUE : SQLITE_FALSE,
          transaction.systemGeneratedType ?? null,
          transaction.lockedReason ?? null,
          transaction.amortizationMonths ?? null,
          transaction.createdAt,
        );
      }
    });
    return;
  }
  // Web fallback: sequential writes
  for (const transaction of transactions) {
    await addTransaction(transaction);
  }
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
    await db.runAsync("DELETE FROM credit_card_autopay_execution_logs");
    await db.runAsync("DELETE FROM credit_card_autopay_rules");
    await db.runAsync("DELETE FROM cash_topup_rules");
    await db.runAsync("DELETE FROM transfer_templates");
    await db.runAsync("DELETE FROM exchange_rates");
    await db.runAsync("DELETE FROM categories");
    await db.runAsync("DELETE FROM accounts");
    await db.runAsync("DELETE FROM stock_watchlist");
    await db.runAsync("DELETE FROM stock_transactions");
    await db.runAsync("DELETE FROM stock_prices_cache");
    await db.runAsync("DELETE FROM etf_holdings");
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      [SETTINGS_KEY_ONBOARDING, "false"],
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      [STORAGE_KEYS.CUSTOM_CURRENCIES, "[]"],
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      [BUDGET_SETTINGS_KEY, JSON.stringify({
        defaultMonthlyIncome: 0,
        weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
        weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
      })],
    );
    await AsyncStorage.removeItem(STORAGE_KEYS.STOCK_TRANSACTIONS);
    await AsyncStorage.removeItem(STORAGE_KEYS.STOCK_PRICES_CACHE);
    await AsyncStorage.removeItem(STORAGE_KEYS.ETF_HOLDINGS);
    return;
  }
  await saveTransactions([]);
  await saveRecurringSkipList([]);
  await saveRecurring([]);
  await saveMonthlyFixedItems([]);
  await AsyncStorage.removeItem(STORAGE_KEYS.ANNUAL_BUDGET_ENTRIES);
  await AsyncStorage.removeItem(STORAGE_KEYS.CREDIT_CARD_AUTOPAY_RULES);
  await AsyncStorage.removeItem(STORAGE_KEYS.CREDIT_CARD_AUTOPAY_EXECUTION_LOGS);
  await AsyncStorage.removeItem(STORAGE_KEYS.CASH_TOPUP_RULES);
  await AsyncStorage.removeItem(TRANSFER_TEMPLATES_ASYNC_KEY);
  await AsyncStorage.removeItem(STORAGE_KEYS.EXCHANGE_RATES);
  await saveBudgetSettings({
    defaultMonthlyIncome: 0,
    weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
    weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
  });
  await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING);
  await AsyncStorage.removeItem(STORAGE_KEYS.CATEGORIES);
  await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_CURRENCIES);
  await AsyncStorage.removeItem(STORAGE_KEYS.STOCK_TRANSACTIONS);
  await AsyncStorage.removeItem(STORAGE_KEYS.STOCK_PRICES_CACHE);
  await AsyncStorage.removeItem(STORAGE_KEYS.ETF_HOLDINGS);
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

// ─────────────────────────────────────────────
// Stock transactions
// ─────────────────────────────────────────────

function rowToStockTransaction(row: Record<string, unknown>): StockTransaction {
  return {
    id: row.id as string,
    ticker: row.ticker as string,
    name: row.name as string,
    date: row.date as string,
    type: row.type as 'buy' | 'sell',
    shares: row.shares as number,
    priceNative: row.price_native as number,
    usdCost: row.usd_cost != null ? (row.usd_cost as number) : undefined,
    twdCost: row.twd_cost as number,
    exchangeRate: row.exchange_rate != null ? (row.exchange_rate as number) : undefined,
    note: row.note as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getStockTransactions(): Promise<StockTransaction[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM stock_transactions ORDER BY date ASC, created_at ASC'
    );
    return rows.map(rowToStockTransaction);
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.STOCK_TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StockTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getStockTransactionsByTicker(ticker: string): Promise<StockTransaction[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM stock_transactions WHERE ticker = ? ORDER BY date ASC',
      ticker,
    );
    return rows.map(rowToStockTransaction);
  }
  const all = await getStockTransactions();
  return all.filter(t => t.ticker === ticker).sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveStockTransaction(tx: StockTransaction): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      `INSERT OR REPLACE INTO stock_transactions` +
      ` (id,ticker,name,date,type,shares,price_native,usd_cost,twd_cost,exchange_rate,note,created_at)` +
      ` VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      tx.id,
      tx.ticker,
      tx.name,
      tx.date,
      tx.type,
      tx.shares,
      tx.priceNative,
      tx.usdCost ?? null,
      tx.twdCost,
      tx.exchangeRate ?? null,
      tx.note ?? null,
      tx.createdAt,
    );
    return;
  }
  const all = await getStockTransactions();
  const idx = all.findIndex(t => t.id === tx.id);
  if (idx >= 0) all[idx] = tx;
  else all.push(tx);
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(all));
}

/** SQL 字串值跳脫（單引號加倍） */
function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
/** 數值或 NULL */
function sqlNum(v: number | undefined | null): string {
  return v == null || !isFinite(v) ? 'NULL' : String(v);
}

export async function saveStockTransactions(txs: StockTransaction[]): Promise<void> {
  const db = await getDb();
  if (db) {
    for (const tx of txs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO stock_transactions` +
        ` (id,ticker,name,date,type,shares,price_native,usd_cost,twd_cost,exchange_rate,note,created_at)` +
        ` VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        tx.id,
        tx.ticker,
        tx.name,
        tx.date,
        tx.type,
        tx.shares,
        tx.priceNative,
        tx.usdCost ?? null,
        tx.twdCost,
        tx.exchangeRate ?? null,
        tx.note ?? null,
        tx.createdAt,
      );
    }
    return;
  }
  const existing = await getStockTransactions();
  const existingIds = new Set(existing.map(t => t.id));
  const merged = [...existing, ...txs.filter(t => !existingIds.has(t.id))];
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(merged));
}

export async function deleteStockTransaction(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync('DELETE FROM stock_transactions WHERE id = ?', id);
    return;
  }
  const all = await getStockTransactions();
  const next = all.filter(t => t.id !== id);
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(next));
}

// ─────────────────────────────────────────────
// Stock price cache
// ─────────────────────────────────────────────

export async function getStockPriceCache(ticker: string): Promise<StockPriceCache | null> {
  const db = await getDb();
  if (db) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM stock_prices_cache WHERE ticker = ?',
      [ticker]
    );
    if (!row) return null;
    return {
      ticker: row.ticker as string,
      price: row.price as number,
      currency: row.currency as 'TWD' | 'USD',
      lastUpdated: row.last_updated as string,
    };
  }
  const all = await getAllStockPricesCache();
  return all.find(p => p.ticker === ticker) ?? null;
}

export async function setStockPriceCache(cache: StockPriceCache): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      `INSERT OR REPLACE INTO stock_prices_cache (ticker, price, currency, last_updated)
       VALUES (?, ?, ?, ?)`,
      [cache.ticker, cache.price, cache.currency, cache.lastUpdated]
    );
    return;
  }
  const all = await getAllStockPricesCache();
  const idx = all.findIndex(p => p.ticker === cache.ticker);
  if (idx >= 0) all[idx] = cache;
  else all.push(cache);
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_PRICES_CACHE, JSON.stringify(all));
}

export async function getAllStockPricesCache(): Promise<StockPriceCache[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM stock_prices_cache'
    );
    return rows.map(r => ({
      ticker: r.ticker as string,
      price: r.price as number,
      currency: r.currency as 'TWD' | 'USD',
      lastUpdated: r.last_updated as string,
    }));
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.STOCK_PRICES_CACHE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StockPriceCache[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// ETF holdings
// ─────────────────────────────────────────────

export async function getETFHoldings(etfTicker: string): Promise<ETFHolding[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM etf_holdings WHERE etf_ticker = ? ORDER BY rank ASC',
      [etfTicker]
    );
    return rows.map(r => ({
      etfTicker: r.etf_ticker as string,
      rank: r.rank as number,
      companyName: r.company_name as string,
      weightPct: r.weight_pct as number,
      lastUpdated: r.last_updated as string,
    }));
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ETF_HOLDINGS);
    if (!raw) return [];
    const all = JSON.parse(raw) as ETFHolding[];
    return all.filter(h => h.etfTicker === etfTicker).sort((a, b) => a.rank - b.rank);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Stock watchlist
// ─────────────────────────────────────────────

/** 預設常用股票（首次使用時的初始清單） */
const DEFAULT_WATCHLIST: StockWatchlistItem[] = [
  { ticker: '006208', name: '富邦台灣優質高息 ETF', currency: 'TWD', sortOrder: 0 },
  { ticker: 'NVDA',   name: 'NVIDIA',               currency: 'USD', sortOrder: 1 },
  { ticker: 'QQQ',    name: 'Invesco QQQ ETF',       currency: 'USD', sortOrder: 2 },
  { ticker: 'SMH',    name: 'VanEck Semiconductor ETF', currency: 'USD', sortOrder: 3 },
  { ticker: 'GLD',    name: 'SPDR Gold Shares ETF',  currency: 'USD', sortOrder: 4 },
  { ticker: 'IBIT',   name: 'iShares Bitcoin Trust ETF', currency: 'USD', sortOrder: 5 },
  { ticker: 'ARKK',   name: 'ARK Innovation ETF',    currency: 'USD', sortOrder: 6 },
];

export async function getStockWatchlist(): Promise<StockWatchlistItem[]> {
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM stock_watchlist ORDER BY sort_order ASC, ticker ASC'
    );
    if (rows.length > 0) {
      return rows.map(r => ({
        ticker: r.ticker as string,
        name: r.name as string,
        currency: r.currency as 'TWD' | 'USD',
        sortOrder: r.sort_order as number,
      }));
    }
    // 首次使用：寫入預設清單
    for (const item of DEFAULT_WATCHLIST) {
      await db.runAsync(
        'INSERT OR IGNORE INTO stock_watchlist (ticker, name, currency, sort_order) VALUES (?, ?, ?, ?)',
        item.ticker, item.name, item.currency, item.sortOrder,
      );
    }
    return DEFAULT_WATCHLIST;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.STOCK_WATCHLIST);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEYS.STOCK_WATCHLIST, JSON.stringify(DEFAULT_WATCHLIST));
      return DEFAULT_WATCHLIST;
    }
    const parsed = JSON.parse(raw) as StockWatchlistItem[];
    return Array.isArray(parsed) ? parsed : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export async function saveStockWatchlistItem(item: StockWatchlistItem): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync(
      'INSERT OR REPLACE INTO stock_watchlist (ticker, name, currency, sort_order) VALUES (?, ?, ?, ?)',
      item.ticker, item.name, item.currency, item.sortOrder,
    );
    return;
  }
  const all = await getStockWatchlist();
  const idx = all.findIndex(i => i.ticker === item.ticker);
  if (idx >= 0) all[idx] = item; else all.push(item);
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_WATCHLIST, JSON.stringify(all));
}

export async function deleteStockWatchlistItem(ticker: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.runAsync('DELETE FROM stock_watchlist WHERE ticker = ?', ticker);
    return;
  }
  const all = await getStockWatchlist();
  await AsyncStorage.setItem(
    STORAGE_KEYS.STOCK_WATCHLIST,
    JSON.stringify(all.filter(i => i.ticker !== ticker))
  );
}

export async function reorderStockWatchlist(items: StockWatchlistItem[]): Promise<void> {
  const db = await getDb();
  if (db) {
    for (let i = 0; i < items.length; i++) {
      await db.runAsync(
        'UPDATE stock_watchlist SET sort_order = ? WHERE ticker = ?',
        i, items[i].ticker,
      );
    }
    return;
  }
  const updated = items.map((item, i) => ({ ...item, sortOrder: i }));
  await AsyncStorage.setItem(STORAGE_KEYS.STOCK_WATCHLIST, JSON.stringify(updated));
}

export async function saveETFHoldings(holdings: ETFHolding[]): Promise<void> {
  const db = await getDb();
  if (db) {
    if (holdings.length === 0) return;
    const etfTicker = holdings[0].etfTicker;
    await db.runAsync('DELETE FROM etf_holdings WHERE etf_ticker = ?', [etfTicker]);
    for (const h of holdings) {
      await db.runAsync(
        `INSERT INTO etf_holdings (etf_ticker, rank, company_name, weight_pct, last_updated)
         VALUES (?, ?, ?, ?, ?)`,
        [h.etfTicker, h.rank, h.companyName, h.weightPct, h.lastUpdated]
      );
    }
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ETF_HOLDINGS);
    let all = raw ? (JSON.parse(raw) as ETFHolding[]) : [];
    if (holdings.length > 0) {
      const etfTicker = holdings[0].etfTicker;
      all = all.filter(h => h.etfTicker !== etfTicker);
      all.push(...holdings);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.ETF_HOLDINGS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// ─── Alpha Vantage API Key ────────────────────────────────────────────────────

export async function getAlphaVantageApiKey(): Promise<string> {
  const db = await getDb();
  if (db) {
    await ensureMigrationDone(db);
    const val = await getSetting(db, STORAGE_KEYS.ALPHAVANTAGE_API_KEY);
    return val ?? '';
  }
  return (await AsyncStorage.getItem(STORAGE_KEYS.ALPHAVANTAGE_API_KEY)) ?? '';
}

export async function setAlphaVantageApiKey(key: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await setSetting(db, STORAGE_KEYS.ALPHAVANTAGE_API_KEY, key.trim());
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.ALPHAVANTAGE_API_KEY, key.trim());
}
