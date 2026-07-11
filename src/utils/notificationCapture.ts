/**
 * Phase 0：擷取到的原始通知（raw dump），用於驗證能否讀到 LINE/銀行通知並觀察格式。
 * 尚不做任何解析。Web 無 SQLite 時所有操作為 no-op。
 */
import { getDb } from "../db";
import { generateId } from "./id";

/** 原始通知紀錄只保留最新這麼多筆，避免無限增長佔空間 */
const MAX_CAPTURED_NOTIFICATIONS = 100;

export interface CapturedNotification {
  id: string;
  app: string | null;
  title: string | null;
  text: string | null;
  bigText: string | null;
  /** 移除 base64 圖示後的完整 payload JSON，方便日後觀察全部欄位 */
  rawJson: string;
  capturedAt: string;
}

interface CapturedNotificationRow {
  id: string;
  app: string | null;
  title: string | null;
  text: string | null;
  big_text: string | null;
  raw_json: string;
  captured_at: string;
}

/** 由 headless task 呼叫：存下一則通知的原始內容。 */
export async function saveCapturedNotification(
  payload: Record<string, unknown> | null | undefined,
): Promise<void> {
  const db = await getDb();
  if (!db || !payload) return;
  // 移除 base64 的 icon/image，避免 raw_json 過大
  const { icon: _icon, image: _image, ...rest } = payload as Record<string, unknown>;
  await db.runAsync(
    "INSERT INTO captured_notifications (id, app, title, text, big_text, raw_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    generateId(),
    (payload.app as string) ?? null,
    (payload.title as string) ?? null,
    (payload.text as string) ?? null,
    (payload.bigText as string) ?? null,
    JSON.stringify(rest),
    new Date().toISOString(),
  );
  // 只保留最新 N 筆（依擷取時間），清掉超出的舊紀錄
  await db.runAsync(
    `DELETE FROM captured_notifications WHERE id NOT IN (
       SELECT id FROM captured_notifications ORDER BY captured_at DESC LIMIT ?
     )`,
    MAX_CAPTURED_NOTIFICATIONS,
  );
}

export async function getCapturedNotifications(limit = 200): Promise<CapturedNotification[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<CapturedNotificationRow>(
    "SELECT id, app, title, text, big_text, raw_json, captured_at FROM captured_notifications ORDER BY captured_at DESC LIMIT ?",
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    app: r.app,
    title: r.title,
    text: r.text,
    bigText: r.big_text,
    rawJson: r.raw_json,
    capturedAt: r.captured_at,
  }));
}

export async function getCapturedNotificationCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM captured_notifications",
  );
  return row?.count ?? 0;
}

export async function clearCapturedNotifications(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync("DELETE FROM captured_notifications");
}

/** 測試用：注入幾筆已知格式的假通知，方便驗證解析→去重→待確認流程，不用真的刷卡。 */
const SAMPLE_NOTIFICATIONS: Record<string, unknown>[] = [
  {
    app: "jp.naver.line.android",
    title: "永豐銀行",
    text: "永豐貴賓您好，末四碼6908感謝07/11 12:10刷卡台幣65元，商店名稱:大全聯，實際商店名稱",
  },
  {
    app: "tw.com.taishinbank.ccapp",
    title: "信用卡消費通知",
    text: "【信用卡消費通知】您的Richart卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣79元，實際消費資訊以帳單為準，如有疑問請洽客服",
  },
  {
    app: "jp.naver.line.android",
    title: "LINE錢包",
    text: "LINE Pay 付款 NT$ 128 付款完成。\n商店名稱: 星巴克",
  },
];

export async function insertSampleNotifications(): Promise<void> {
  for (const s of SAMPLE_NOTIFICATIONS) {
    await saveCapturedNotification(s);
  }
}
