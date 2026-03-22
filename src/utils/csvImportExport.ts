/**
 * 記帳資料 CSV 匯入／匯出
 * 匯出：本 app 交易 → CSV（日期,收支,類別,金額,帳戶,備註,建立時間）
 * 匯入：對方 APP CSV（日期,大類別,類別,金額,帳戶,貨幣,成員,備註,收支,上次更新）→ Transaction[]
 */
import { DEFAULT_IMPORTED_CATEGORY_ICON, DEFAULT_EXPENSE_CATEGORIES } from '../constants';
import type { Account, CategoryItem, StoredCategories, Transaction, TransactionType } from '../types';
import { generateId } from './id';

/** 與 parseSourceCsv 一致：trim 後若空則視為「其他」 */
const FALLBACK_CATEGORY_LABEL = DEFAULT_EXPENSE_CATEGORIES.other;

/** 預設「其他」類別 key；靜態表將多種名稱對應到此 key 時，不可一律併入既有「其他」，否則保險／居家等會與真實「其他」混帳 */
const OTHER_CATEGORY_KEY = 'other';

function normalizeCategoryNameForImport(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/^"|"$/g, '');
  return trimmed !== '' ? trimmed : FALLBACK_CATEGORY_LABEL;
}

const UTF8_BOM = '\uFEFF';
const EXPORT_HEADER = '日期,收支,類別,金額,帳戶,備註,建立時間,轉入帳戶,轉入金額';
const INCOME_LABEL = '收入';
const EXPENSE_LABEL = '支出';
const TRANSFER_LABEL = '轉帳';

/** 對方 APP 支出類別名稱 → 本 app 類別 key */
export const SOURCE_EXPENSE_CATEGORY_TO_KEY: Record<string, string> = {
  飲食: 'food',
  交通: 'transport',
  娛樂: 'entertainment',
  購物: 'shopping',
  其他: 'other',
  學習深造: 'other',
  醫療保健: 'other',
  保險: 'other',
  電話網路: 'other',
  居家: 'other',
};

/** 對方 APP 收入類別名稱 → 本 app 類別 key */
export const SOURCE_INCOME_CATEGORY_TO_KEY: Record<string, string> = {
  工資: 'salary',
  薪水: 'salary',
  獎金: 'bonus',
  投資: 'investment',
  其他: 'other',
};

export interface ParsedSourceRow {
  date: string;
  type: TransactionType;
  amount: number;
  categoryName: string;
  accountName: string;
  note: string;
  lastUpdated: string;
}

/**
 * 解析 CSV 單行（支援雙引號包住的欄位與逗號）
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * 解析對方 APP 匯出的 CSV，回傳可轉成 Transaction 的列陣
 */
export function parseSourceCsv(csvText: string): ParsedSourceRow[] {
  const text = csvText.startsWith(UTF8_BOM) ? csvText.slice(UTF8_BOM.length) : csvText;
  const lines = text.split(/\r?\n/).filter((s) => s.trim().length > 0);
  if (lines.length < 2) return [];
  const rows: ParsedSourceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 9) continue;
    const date = cols[0]?.trim() ?? '';
    const amountRaw = cols[3]?.trim() ?? '';
    const accountName = (cols[4]?.trim() ?? '').replace(/^""|""$/g, '') || '現金';
    const note = (cols[7]?.trim() ?? '').replace(/^"|"$/g, '');
    const typeStr = cols[8]?.trim() ?? '';
    const type: TransactionType = typeStr === INCOME_LABEL ? 'income' : 'expense';
    const amount = parseFloat(amountRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount <= 0) continue;
    const categoryName = (cols[2]?.trim() ?? '').replace(/^"|"$/g, '') || '其他';
    const lastUpdated = cols[9]?.trim() ?? date;
    rows.push({
      date,
      type,
      amount,
      categoryName,
      accountName,
      note,
      lastUpdated,
    });
  }
  return rows;
}

/**
 * 將 parseSourceCsv 的列轉成 Transaction，並回傳需新增的帳戶（名稱 → 未存在則新建）
 * 呼叫端需：getStoredAccounts() → 對 row 中不重複 accountName 若無則 push 新 Account → updateStoredAccounts → 再建 name→id map 傳入
 */
export function parsedRowsToTransactions(
  rows: ParsedSourceRow[],
  accountNameToId: Record<string, string>,
  resolveCategoryKey: (type: TransactionType, categoryName: string) => string,
): Transaction[] {
  const transactions: Transaction[] = [];
  for (const row of rows) {
    const categoryKey = resolveCategoryKey(row.type, row.categoryName);
    let createdAt: string;
    try {
      const parsed = new Date(row.lastUpdated.replace(' ', 'T'));
      createdAt = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
    } catch {
      createdAt = new Date().toISOString();
    }
    const accountId = accountNameToId[row.accountName] ?? undefined;
    transactions.push({
      id: generateId(),
      type: row.type,
      amount: row.amount,
      date: row.date,
      category: categoryKey,
      note: row.note || undefined,
      accountId,
      createdAt,
    });
  }
  return transactions;
}

/**
 * 建立「帳戶名稱 → id」對照，並回傳合併後帳戶列表（含匯入中出現但原本沒有的新帳戶）
 */
export function resolveAccountsForImport(
  existingAccounts: Account[],
  accountNamesFromCsv: string[],
): { accountNameToId: Record<string, string>; mergedAccounts: Account[] } {
  const uniqueNames = Array.from(new Set(accountNamesFromCsv.filter((n) => n.trim())));
  const nameToId: Record<string, string> = {};
  const merged = [...existingAccounts];
  for (const name of uniqueNames) {
    const found = merged.find((a) => a.name.trim() === name.trim());
    if (found) {
      nameToId[name] = found.id;
    } else {
      const newAccount: Account = {
        id: generateId(),
        name: name.trim(),
        initialBalance: 0,
        currency: "TWD",
      };
      merged.push(newAccount);
      nameToId[name] = newAccount.id;
    }
  }
  return { accountNameToId: nameToId, mergedAccounts: merged };
}

/**
 * 依匯入列決定類別 key：R1 label 命中 → R2–R3 靜態對照表 + key 存在 → R4 新建；同一批 (type, categoryName) 僅新建一次（R5）。
 */
export function resolveCategoriesForImport(
  existing: StoredCategories,
  rows: ParsedSourceRow[],
): {
  mergedCategories: StoredCategories;
  resolveCategoryKey: (type: TransactionType, categoryName: string) => string;
} {
  const mergedCategories: StoredCategories = {
    expense: [...existing.expense],
    income: [...existing.income],
  };

  const resolutionCache = new Map<string, string>();

  const cacheKey = (type: TransactionType, normalizedName: string): string => `${type}:${normalizedName}`;

  const resolveStaticMapKey = (type: TransactionType, categoryName: string): string | undefined => {
    const map = type === 'income' ? SOURCE_INCOME_CATEGORY_TO_KEY : SOURCE_EXPENSE_CATEGORY_TO_KEY;
    return map[categoryName];
  };

  const resolveOne = (type: TransactionType, normalizedName: string): string => {
    const list = type === 'income' ? mergedCategories.income : mergedCategories.expense;

    const byLabel = list.find((c) => c.label === normalizedName);
    if (byLabel) {
      return byLabel.key;
    }

    const mappedKey = resolveStaticMapKey(type, normalizedName);
    if (mappedKey) {
      const byKey = list.find((c) => c.key === mappedKey);
      if (byKey) {
        if (mappedKey === OTHER_CATEGORY_KEY) {
          const mergeIntoOtherBucket =
            byKey.label === normalizedName || normalizedName === FALLBACK_CATEGORY_LABEL;
          if (mergeIntoOtherBucket) {
            return byKey.key;
          }
        } else {
          return byKey.key;
        }
      }
    }

    const newKey = generateId();
    const newItem: CategoryItem = {
      key: newKey,
      label: normalizedName,
      icon: DEFAULT_IMPORTED_CATEGORY_ICON,
    };
    list.push(newItem);
    return newKey;
  };

  const seen = new Set<string>();
  const uniquePairs: Array<{ type: TransactionType; categoryName: string }> = [];
  for (const row of rows) {
    const normalizedName = normalizeCategoryNameForImport(row.categoryName);
    const pairKey = `${row.type}:${normalizedName}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    uniquePairs.push({ type: row.type, categoryName: normalizedName });
  }

  for (const { type, categoryName } of uniquePairs) {
    const resolved = resolveOne(type, categoryName);
    resolutionCache.set(cacheKey(type, categoryName), resolved);
  }

  const resolveCategoryKey = (type: TransactionType, categoryName: string): string => {
    const normalizedName = normalizeCategoryNameForImport(categoryName);
    const ck = cacheKey(type, normalizedName);
    const cached = resolutionCache.get(ck);
    if (cached !== undefined) {
      return cached;
    }
    const resolved = resolveOne(type, normalizedName);
    resolutionCache.set(ck, resolved);
    return resolved;
  };

  return { mergedCategories, resolveCategoryKey };
}

/**
 * 將本 app 交易匯出為 CSV 字串（UTF-8，含 BOM 以利 Excel）
 */
export function exportTransactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  getCategoryLabel: (type: TransactionType, categoryKey: string) => string,
): string {
  const accountIdToName = (id: string | undefined): string => {
    if (!id) return '現金';
    const a = accounts.find((x) => x.id === id);
    return a?.name?.trim() ?? '現金';
  };
  const escape = (s: string): string => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [EXPORT_HEADER];
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt.localeCompare(b.createdAt),
  );
  for (const t of sorted) {
    const typeLabel =
      t.type === 'income' ? INCOME_LABEL : t.type === 'transfer' ? TRANSFER_LABEL : EXPENSE_LABEL;
    const categoryLabel =
      t.type === 'transfer' ? '轉帳' : getCategoryLabel(t.type, t.category);
    lines.push(
      [
        t.date,
        typeLabel,
        escape(categoryLabel),
        t.amount,
        escape(accountIdToName(t.accountId)),
        escape(t.note ?? ''),
        t.createdAt,
        t.type === 'transfer' ? escape(accountIdToName(t.toAccountId)) : '',
        t.type === 'transfer' && t.transferAmount != null ? t.transferAmount : '',
      ].join(','),
    );
  }
  return UTF8_BOM + lines.join('\n');
}
