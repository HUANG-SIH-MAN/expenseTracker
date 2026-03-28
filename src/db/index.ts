/**
 * SQLite 資料庫：開庫、建表、匯出查詢介面
 * Web 環境不支援 expo-sqlite，回傳 null 由上層改用 AsyncStorage
 */
import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

const DB_NAME = "expense_tracker.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;

function getSchemaSql(): string {
  return `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  is_hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  account_id TEXT,
  recurring_id TEXT,
  annual_budget_entry_id TEXT,
  to_account_id TEXT,
  transfer_amount REAL,
  is_system_generated INTEGER NOT NULL DEFAULT 0,
  system_generated_type TEXT,
  locked_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency_code TEXT PRIMARY KEY,
  rate_to_primary REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(kind, key)
);

CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  account_id TEXT,
  repeat TEXT NOT NULL,
  day INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recurring_skip (
  recurring_id TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (recurring_id, date)
);

CREATE TABLE IF NOT EXISTS monthly_fixed_items (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category_key TEXT,
  estimated_amount REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS annual_budget_entries (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  type TEXT NOT NULL,
  category_key TEXT NOT NULL,
  label TEXT,
  estimated_amount REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS credit_card_autopay_rules (
  id TEXT PRIMARY KEY,
  credit_card_account_id TEXT NOT NULL,
  pay_from_account_id TEXT NOT NULL,
  statement_day INTEGER NOT NULL,
  payment_day INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS credit_card_autopay_execution_logs (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  scheduled_payment_date TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  created_transaction_id TEXT,
  detail TEXT,
  executed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_topup_rules (
  id TEXT PRIMARY KEY,
  target_account_id TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  threshold REAL NOT NULL,
  top_up_amount REAL NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_annual_budget_entries_year ON annual_budget_entries(year);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_annual_entry ON transactions(annual_budget_entry_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_id ON transactions(recurring_id);
CREATE INDEX IF NOT EXISTS idx_recurring_skip_lookup ON recurring_skip(recurring_id, date);
CREATE INDEX IF NOT EXISTS idx_cc_autopay_rules_card_account ON credit_card_autopay_rules(credit_card_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_autopay_unique_active_card
ON credit_card_autopay_rules(credit_card_account_id)
WHERE is_enabled = 1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cc_autopay_logs_rule_scheduled
ON credit_card_autopay_execution_logs(rule_id, scheduled_payment_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_autopay_logs_rule_date_attempt
ON credit_card_autopay_execution_logs(rule_id, scheduled_payment_date, attempt);
`.trim();
}

/**
 * 取得已初始化的 DB 實例（首次呼叫時開庫並執行 schema）。
 * Web 環境回傳 null，呼叫端應改用 AsyncStorage。
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === "web") {
    return null;
  }
  if (dbInstance != null) {
    return dbInstance;
  }
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(getSchemaSql());
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN annual_budget_entry_id TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE annual_budget_entries ADD COLUMN label TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'TWD'"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN to_account_id TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN transfer_amount REAL"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN is_system_generated INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN system_generated_type TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN locked_reason TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE categories ADD COLUMN default_account_id TEXT",
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE accounts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS cash_topup_rules (
      id TEXT PRIMARY KEY,
      target_account_id TEXT NOT NULL,
      source_account_id TEXT NOT NULL,
      threshold REAL NOT NULL,
      top_up_amount REAL NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch {
    // Table already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN monthly_fixed_item_id TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE monthly_fixed_items ADD COLUMN recurring_item_id TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE monthly_fixed_items ADD COLUMN currency TEXT"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE monthly_fixed_items ADD COLUMN original_amount REAL"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE accounts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists on existing DBs
  }
  dbInstance = db;
  return db;
}
