/**
 * Phase 3：把擷取到的通知解析並去重，存成「待確認」清單；使用者確認後才寫進 transactions。
 * 去重規則依使用者決定：
 *  - LINE 同則通知重複貼出 → 同管道、同金額、時間相近視為重複，丟棄。
 *  - 台新 App 通知 與 LINE Pay 通知為同一筆時 → 只留台新那筆（LINE Pay 丟棄）。
 */
import { getDb } from "../db";
import { generateId } from "./id";
import {
  getCapturedNotifications,
  type CapturedNotification,
} from "./notificationCapture";
import { parseNotification, type NotificationSource } from "./notificationParser";
import {
  decidePendingInsert,
  defaultCategoryForBank,
  type DedupItem,
} from "./pendingDedup";

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

async function insertPending(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  p: {
    sourceNotificationId: string | null;
    amount: number;
    currency: string;
    merchant: string | null;
    last4: string | null;
    bank: string;
    source: NotificationSource;
    occurredAt: string;
    defaultCategoryKey: string;
  },
): Promise<void> {
  await db.runAsync(
    "INSERT INTO pending_transactions (id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)",
    generateId(),
    p.sourceNotificationId,
    p.amount,
    p.currency,
    p.merchant,
    p.last4,
    p.bank,
    p.source,
    p.occurredAt,
    p.defaultCategoryKey,
    new Date().toISOString(),
  );
}

/**
 * 掃描尚未處理的通知，解析並去重後寫入待確認清單。回傳新增筆數。
 */
export async function syncNotificationsToPending(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const unprocessed = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM captured_notifications WHERE processed_at IS NULL",
  );
  if (unprocessed.length === 0) return 0;

  // 取全部通知（含內容），只處理未處理的那些
  const unprocessedIds = new Set(unprocessed.map((r) => r.id));
  const all = await getCapturedNotifications(1000);
  const toProcess = all
    .filter((n) => unprocessedIds.has(n.id))
    // 依擷取時間由舊到新處理，讓去重的「既有筆」順序正確
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  // 目前仍 pending 的筆，作為去重基準
  const pendingRows = await db.getAllAsync<PendingRow>(
    "SELECT id, bank, source, amount, merchant, last4, occurred_at as occurred_at FROM pending_transactions WHERE status = 'pending'",
  );
  const existing: DedupItem[] = pendingRows.map((r) => ({
    id: r.id,
    bank: r.bank,
    source: r.source,
    amount: r.amount,
    merchant: r.merchant,
    last4: r.last4,
    occurredAt: r.occurred_at,
  }));

  let inserted = 0;
  for (const n of toProcess) {
    const parsed = parseNotification(n as CapturedNotification);
    // 無論是否解析成功，都標記已處理，避免重複掃描
    await db.runAsync(
      "UPDATE captured_notifications SET processed_at = ? WHERE id = ?",
      new Date().toISOString(),
      n.id,
    );
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

    // 取代（刪除）被 supersede 的既有 LINE Pay 筆
    for (const supId of decision.supersedeIds) {
      await db.runAsync("DELETE FROM pending_transactions WHERE id = ?", supId);
    }
    const remaining = existing.filter((e) => !decision.supersedeIds.includes(e.id));

    const newId = generateId();
    await insertPending(db, {
      sourceNotificationId: n.id,
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: parsed.merchant,
      last4: parsed.last4,
      bank: parsed.bank,
      source: parsed.source,
      occurredAt: parsed.occurredAt,
      defaultCategoryKey: defaultCategoryForBank(parsed.bank),
    });
    inserted += 1;
    // 更新記憶體中的既有清單，讓同一批後續筆能正確去重
    existing.length = 0;
    existing.push(...remaining, { ...candidate, id: newId });
  }

  return inserted;
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<PendingRow>(
    "SELECT id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at FROM pending_transactions WHERE status = 'pending' ORDER BY occurred_at DESC",
  );
  return rows.map(rowToPending);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pending_transactions WHERE status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function getPendingById(id: string): Promise<PendingTransaction | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<PendingRow>(
    "SELECT id, source_notification_id, amount, currency, merchant, last4, bank, source, occurred_at, default_category_key, status, created_transaction_id, created_at FROM pending_transactions WHERE id = ?",
    id,
  );
  return row ? rowToPending(row) : null;
}

export async function confirmPending(
  id: string,
  createdTransactionId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    "UPDATE pending_transactions SET status = 'confirmed', created_transaction_id = ? WHERE id = ?",
    createdTransactionId,
    id,
  );
}

export async function dismissPending(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    "UPDATE pending_transactions SET status = 'dismissed' WHERE id = ?",
    id,
  );
}

/**
 * 測試/修復用：清掉尚未確認的待確認筆、重置所有通知的已處理標記，
 * 再重新解析一次全部通知。回傳這次新增的待確認筆數。
 * （用於解析器改版後，把之前已擷取的通知重新跑一遍。）
 */
export async function reprocessAllNotifications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  await db.runAsync("DELETE FROM pending_transactions WHERE status = 'pending'");
  await db.runAsync("UPDATE captured_notifications SET processed_at = NULL");
  return syncNotificationsToPending();
}
