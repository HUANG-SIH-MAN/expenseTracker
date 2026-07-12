/**
 * 把擷取到的通知解析並去重，直接自動記成一筆交易（寫進 transactions）。
 * 去重規則依使用者決定：
 *  - LINE 同則通知重複貼出 → 同管道、同金額、時間相近視為重複，丟棄。
 *  - 台新 App 通知 與 LINE Pay 通知為同一筆時 → 只留台新那筆（LINE Pay 丟棄）。
 * pending_transactions 表在此作為「自動記帳紀錄」（status='auto'），連結所建立的交易，
 * 供使用者檢視/編輯/刪除。
 */
import { getDb } from "../db";
import { generateId } from "./id";
import {
  getCapturedNotifications,
  LINE_PACKAGE,
  type CapturedNotification,
} from "./notificationCapture";
import { parseNotification, type NotificationSource } from "./notificationParser";
import {
  decidePendingInsert,
  defaultCategoryForBank,
  type DedupItem,
} from "./pendingDedup";
import { addTransaction, deleteTransaction } from "./storage";
import { ensureCardRulesSeeded, getCardRules, resolveBinding } from "./cardRules";

export { decidePendingInsert, defaultCategoryForBank };
export type { DedupItem };

export interface PendingTransaction {
  id: string;
  sourceNotificationId: string | null;
  amount: number;
  currency: string;
  merchant: string | null;
  last4: string | null;
  bank: string;
  source: NotificationSource;
  occurredAt: string;
  defaultCategoryKey: string | null;
  status: "pending" | "confirmed" | "dismissed";
  createdTransactionId: string | null;
  createdAt: string;
}

interface PendingRow {
  id: string;
  source_notification_id: string | null;
  amount: number;
  currency: string;
  merchant: string | null;
  last4: string | null;
  bank: string;
  source: NotificationSource;
  occurred_at: string;
  default_category_key: string | null;
  status: PendingTransaction["status"];
  created_transaction_id: string | null;
  created_at: string;
}

function rowToPending(r: PendingRow): PendingTransaction {
  return {
    id: r.id,
    sourceNotificationId: r.source_notification_id,
    amount: r.amount,
    currency: r.currency,
    merchant: r.merchant,
    last4: r.last4,
    bank: r.bank,
    source: r.source,
    occurredAt: r.occurred_at,
    defaultCategoryKey: r.default_category_key,
    status: r.status,
    createdTransactionId: r.created_transaction_id,
    createdAt: r.created_at,
  };
}

// ---- DB 操作 ----

/** ISO 時間 → 'YYYY-MM-DD'（本地時區） */
function isoToDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 自動記帳交易的備註：銀行 + 商店 + 末四碼 */
export function buildAutoNote(
  bank: string,
  merchant: string | null,
  last4: string | null,
): string {
  const parts = [bank];
  if (merchant) parts.push(merchant);
  if (last4) parts.push(`(${last4})`);
  return parts.join(" ");
}

type DedupItemWithTx = DedupItem & { txId: string | null };

/**
 * 掃描尚未處理的通知，解析並去重後「自動記成一筆交易」，並在 pending_transactions
 * 留一筆 status='auto' 的紀錄連結該交易。回傳這次自動記帳的筆數。
 */
export async function syncNotificationsToTransactions(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const unprocessed = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM captured_notifications WHERE processed_at IS NULL",
  );
  if (unprocessed.length === 0) return 0;

  await ensureCardRulesSeeded();
  const cardRules = await getCardRules();

  const unprocessedIds = new Set(unprocessed.map((r) => r.id));
  const all = await getCapturedNotifications(1000);
  const toProcess = all
    .filter((n) => unprocessedIds.has(n.id))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  // 近兩天已自動記帳的紀錄作為去重基準（含跨批次的 LINE 重複貼出）
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const recentRows = await db.getAllAsync<PendingRow>(
    "SELECT id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at FROM pending_transactions WHERE status = 'auto' AND occurred_at >= ? ORDER BY occurred_at",
    since,
  );
  const existing: DedupItemWithTx[] = recentRows.map((r) => ({
    id: r.id,
    bank: r.bank,
    source: r.source,
    amount: r.amount,
    merchant: r.merchant,
    last4: r.last4,
    occurredAt: r.occurred_at,
    txId: r.created_transaction_id,
  }));

  let recorded = 0;
  for (const n of toProcess) {
    await db.runAsync(
      "UPDATE captured_notifications SET processed_at = ? WHERE id = ?",
      new Date().toISOString(),
      n.id,
    );
    // 只聽銀行 App，忽略 LINE（避免重複記帳；LINE 仍會擷取供偵錯）
    if (n.app === LINE_PACKAGE) continue;
    const parsed = parseNotification(n as CapturedNotification);
    if (!parsed) continue;

    const candidate: DedupItem = {
      id: "candidate",
      bank: parsed.bank,
      source: parsed.source,
      amount: parsed.amount,
      merchant: parsed.merchant,
      last4: parsed.last4,
      occurredAt: parsed.occurredAt,
    };
    const decision = decidePendingInsert(candidate, existing);
    if (!decision.insert) continue;

    // 台新取代 LINE Pay：刪掉先前自動建立的 LINE Pay 交易與紀錄
    for (const supId of decision.supersedeIds) {
      const sup = existing.find((e) => e.id === supId);
      if (sup?.txId) {
        try {
          await deleteTransaction(sup.txId);
        } catch {
          /* 交易可能已被使用者刪除 */
        }
      }
      await db.runAsync(
        "UPDATE pending_transactions SET status = 'superseded' WHERE id = ?",
        supId,
      );
    }
    const remaining = existing.filter((e) => !decision.supersedeIds.includes(e.id));

    // 依卡片設定綁定帳戶/類別/顯示名稱（末四碼優先，其次 App/關鍵字）
    const content = [n.title, n.text, n.bigText].filter(Boolean).join(" ");
    const binding = resolveBinding(cardRules, parsed.last4, n.app, content);
    const bankLabel = binding.label ?? parsed.bank;
    const category = binding.categoryKey ?? defaultCategoryForBank(parsed.bank);
    const accountId = binding.accountId ?? undefined;

    // 自動記一筆交易（一般交易，不上鎖，可正常編輯/刪除）
    const txId = generateId();
    await addTransaction({
      id: txId,
      type: "expense",
      amount: parsed.amount,
      date: isoToDateKey(parsed.occurredAt),
      category,
      note: buildAutoNote(bankLabel, parsed.merchant, parsed.last4),
      accountId,
      createdAt: new Date().toISOString(),
    });

    // 留一筆自動記帳紀錄
    const logId = generateId();
    await db.runAsync(
      "INSERT INTO pending_transactions (id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?)",
      logId,
      n.id,
      parsed.amount,
      parsed.currency,
      parsed.merchant,
      parsed.last4,
      bankLabel,
      parsed.source,
      parsed.occurredAt,
      category,
      txId,
      new Date().toISOString(),
    );
    recorded += 1;
    existing.length = 0;
    existing.push(...remaining, { ...candidate, id: logId, txId });
  }

  return recorded;
}

/** 自動記帳紀錄（status='auto'），供檢視/編輯/刪除。 */
export async function getAutoRecords(limit = 100): Promise<PendingTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<PendingRow>(
    "SELECT id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at FROM pending_transactions WHERE status = 'auto' ORDER BY occurred_at DESC LIMIT ?",
    limit,
  );
  return rows.map(rowToPending);
}

/** 刪除一筆自動記帳：連同它建立的交易一起刪掉，紀錄標記為 deleted。 */
export async function deleteAutoRecord(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const row = await db.getFirstAsync<PendingRow>(
    "SELECT id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at FROM pending_transactions WHERE id = ?",
    id,
  );
  if (row?.created_transaction_id) {
    try {
      await deleteTransaction(row.created_transaction_id);
    } catch {
      /* 交易可能已被使用者手動刪除 */
    }
  }
  await db.runAsync(
    "UPDATE pending_transactions SET status = 'deleted' WHERE id = ?",
    id,
  );
}

/**
 * 測試/修復用：刪掉所有自動記帳（含其建立的交易），重置通知已處理標記，重跑一次自動記帳。
 */
export async function reprocessAllNotifications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const autos = await db.getAllAsync<{ created_transaction_id: string | null }>(
    "SELECT created_transaction_id FROM pending_transactions WHERE status = 'auto'",
  );
  for (const a of autos) {
    if (a.created_transaction_id) {
      try {
        await deleteTransaction(a.created_transaction_id);
      } catch {
        /* ignore */
      }
    }
  }
  await db.runAsync("DELETE FROM pending_transactions");
  await db.runAsync("UPDATE captured_notifications SET processed_at = NULL");
  return syncNotificationsToTransactions();
}
