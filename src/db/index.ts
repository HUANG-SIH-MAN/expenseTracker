/**
 * SQLite 資料庫：開庫、建表、匯出查詢介面
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'expense_tracker.db';

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
  initial_balance REAL NOT NULL DEFAULT 0
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
  created_at TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_id ON transactions(recurring_id);
CREATE INDEX IF NOT EXISTS idx_recurring_skip_lookup ON recurring_skip(recurring_id, date);
`.trim();
}

/**
 * 取得已初始化的 DB 實例（首次呼叫時開庫並執行 schema）
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance != null) {
    return dbInstance;
  }
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(getSchemaSql());
  dbInstance = db;
  return db;
}
