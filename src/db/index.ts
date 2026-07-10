/**
 * SQLite 資料庫：開庫、建表、匯出查詢介面
 * Web 環境不支援 expo-sqlite，回傳 null 由上層改用 AsyncStorage
 */
import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

const DB_NAME = "expense_tracker.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

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

CREATE TABLE IF NOT EXISTS monthly_saving_targets (
  year_month TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS transfer_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  default_amount REAL,
  linked_transactions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_watchlist (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS captured_notifications (
  id TEXT PRIMARY KEY,
  app TEXT,
  title TEXT,
  text TEXT,
  big_text TEXT,
  raw_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_captured_notifications_captured_at ON captured_notifications(captured_at);

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

CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  shares REAL NOT NULL,
  price_native REAL NOT NULL,
  usd_cost REAL,
  twd_cost REAL NOT NULL,
  exchange_rate REAL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_prices_cache (
  ticker TEXT PRIMARY KEY,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etf_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etf_ticker TEXT NOT NULL,
  rank INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  stock_ticker TEXT,
  weight_pct REAL NOT NULL,
  last_updated TEXT NOT NULL,
  UNIQUE(etf_ticker, rank)
);

CREATE TABLE IF NOT EXISTS stock_fundamentals (
  ticker TEXT PRIMARY KEY,
  market_cap REAL NOT NULL DEFAULT 0,
  pe_ratio REAL,
  eps REAL,
  week52_high REAL NOT NULL DEFAULT 0,
  week52_low REAL NOT NULL DEFAULT 0,
  beta REAL,
  annual_financials TEXT NOT NULL DEFAULT '[]',
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_ticker ON stock_transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_date ON stock_transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
`.trim();
}

/**
 * 取得已初始化的 DB 實例（首次呼叫時開庫並執行 schema）。
 * Web 環境回傳 null，呼叫端應改用 AsyncStorage。
 */
async function initDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === "web") {
    return null;
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
      "ALTER TABLE monthly_fixed_items ADD COLUMN account_id TEXT"
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
  try {
    await db.runAsync(
      "ALTER TABLE accounts ADD COLUMN low_balance_threshold REAL"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS transfer_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      from_account_id TEXT,
      to_account_id TEXT,
      default_amount REAL,
      linked_transactions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch {
    // Table already exists
  }
  try {
    await db.runAsync(
      "ALTER TABLE transactions ADD COLUMN amortization_months INTEGER"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.runAsync(
      "ALTER TABLE credit_card_autopay_rules ADD COLUMN holiday_adjust TEXT NOT NULL DEFAULT 'none'"
    );
  } catch {
    // Column already exists on existing DBs
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_transactions (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      shares REAL NOT NULL,
      price_native REAL NOT NULL,
      usd_cost REAL,
      twd_cost REAL NOT NULL,
      exchange_rate REAL,
      note TEXT,
      created_at TEXT NOT NULL
    )`);
  } catch {
    // Table already exists
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_prices_cache (
      ticker TEXT PRIMARY KEY,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      last_updated TEXT NOT NULL
    )`);
  } catch {
    // Table already exists
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS etf_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_ticker TEXT NOT NULL,
      rank INTEGER NOT NULL,
      company_name TEXT NOT NULL,
      stock_ticker TEXT,
      weight_pct REAL NOT NULL,
      last_updated TEXT NOT NULL,
      UNIQUE(etf_ticker, rank)
    )`);
  } catch {
    // Table already exists
  }
  try {
    await db.runAsync('ALTER TABLE etf_holdings ADD COLUMN stock_ticker TEXT');
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS stock_fundamentals (
      ticker TEXT PRIMARY KEY,
      market_cap REAL NOT NULL DEFAULT 0,
      pe_ratio REAL,
      eps REAL,
      week52_high REAL NOT NULL DEFAULT 0,
      week52_low REAL NOT NULL DEFAULT 0,
      beta REAL,
      annual_financials TEXT NOT NULL DEFAULT '[]',
      last_updated TEXT NOT NULL
    )`);
  } catch {
    // Table already exists
  }
  try {
    await db.runAsync("ALTER TABLE stock_fundamentals ADD COLUMN return_1y REAL");
  } catch {
    // Column already exists
  }
  try {
    await db.runAsync("ALTER TABLE stock_fundamentals ADD COLUMN annualized_volatility REAL");
  } catch {
    // Column already exists
  }
  try {
    await db.runAsync("ALTER TABLE stock_fundamentals ADD COLUMN avg_daily_volume REAL");
  } catch {
    // Column already exists
  }
  try {
    await db.runAsync("ALTER TABLE stock_fundamentals ADD COLUMN price_history TEXT");
  } catch {
    // Column already exists
  }
  try {
    await db.runAsync("ALTER TABLE stock_fundamentals ADD COLUMN quarterly_financials TEXT");
  } catch {
    // Column already exists
  }
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
  `);
  dbInstance = db;
  return db;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === "web") {
    return null;
  }
  if (dbInstance != null) {
    return dbInstance;
  }
  if (dbInitPromise == null) {
    dbInitPromise = initDb();
  }
  return dbInitPromise;
}
