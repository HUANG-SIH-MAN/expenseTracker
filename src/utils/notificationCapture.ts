/**
 * Phase 0：擷取到的原始通知（raw dump），用於驗證能否讀到 LINE/銀行通知並觀察格式。
 * 尚不做任何解析。Web 無 SQLite 時所有操作為 no-op。
 */
import { getDb } from "../db";
import { generateId } from "./id";
import { parseNotification } from "./notificationParser";

/** 原始通知紀錄只保留最新這麼多筆，避免無限增長佔空間 */
const MAX_CAPTURED_NOTIFICATIONS = 100;

/** LINE App 套件名；自動記帳會忽略它（只聽銀行 App），但仍會擷取供偵錯。 */
export const LINE_PACKAGE = "jp.naver.line.android";

export interface DetectedApp {
  /** App 套件名，如 com.sinopac.dawho */
  package: string;
  /** 最近一次該 App 通知的標題，當作友善名稱提示 */
  title: string;
}

/**
 * 從已擷取的通知中，取出「真的發過刷卡消費通知」的 App 清單（排除 LINE），
 * 供設定頁選「要監聽的 App」。用 parseNotification 過濾，把 YouTube/釘釘/促銷
 * 這類雜訊自動擋掉，只留能解析出金額+刷卡/末四碼的 App。
 * title 取自該 App「最近一則可解析的刷卡通知」，避免拿到促銷標題。
 */
export async function getDetectedApps(): Promise<DetectedApp[]> {
  const db = await getDb();
  if (!db) return [];
  // 依 captured_at DESC，先遇到的是最新一筆
  const notifs = await getCapturedNotifications(1000);
  const map = new Map<string, DetectedApp>();
  for (const n of notifs) {
    if (!n.app || n.app === LINE_PACKAGE) continue;
    if (map.has(n.app)) continue;
    if (!parseNotification(n)) continue; // 只列發過刷卡通知的 App
    map.set(n.app, { package: n.app, title: (n.title ?? "").trim() });
  }
  return Array.from(map.values());
}

export interface CapturedNotification {
  id: string;
  app: string | null;
  title: string | null;
  text: string | null;
  bigText: string | null;
  /** 移除 base64 圖示後的完整 payload JSON，方便日後觀察全部欄位 */
  rawJson: string;
  capturedAt: string;
  /** 通知發布時間戳（Android postTime），抓不到為 null；用來去重 */
  postTime: string | null;
}

interface CapturedNotificationRow {
  id: string;
  app: string | null;
  title: string | null;
  text: string | null;
  big_text: string | null;
  raw_json: string;
  captured_at: string;
  post_time: string | null;
}

/** payload 裡代表「通知發布時間戳」的可能欄位（不同版本命名不一）。 */
function extractPostTime(payload: Record<string, unknown>): string | null {
  const raw = payload.time ?? payload.postTime ?? payload.post_time;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/**
 * 判斷這則通知是不是「同一則被系統重放」（例如關 App 再開，監聽服務重連會把
 * 通知欄裡的舊通知重丟一次）。是的話就別再存，避免同一筆刷卡被記兩次。
 *  - 首選：同 app + 同 postTime（postTime 對同一則通知是穩定的）。
 *  - 退而求其次（抓不到 postTime）：同 app + 同 title + 同 text，且 90 秒內已擷取過。
 */
async function isDuplicateCapture(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  app: string | null,
  title: string | null,
  text: string | null,
  postTime: string | null,
): Promise<boolean> {
  if (postTime != null) {
    const hit = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM captured_notifications WHERE app IS ? AND post_time = ? LIMIT 1",
      app,
      postTime,
    );
    return hit != null;
  }
  const since = new Date(Date.now() - 90 * 1000).toISOString();
  const hit = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM captured_notifications WHERE app IS ? AND title IS ? AND text IS ? AND captured_at >= ? LIMIT 1",
    app,
    title,
    text,
    since,
  );
  return hit != null;
}

/** 由 headless task 呼叫：存下一則通知的原始內容。 */
export async function saveCapturedNotification(
  payload: Record<string, unknown> | null | undefined,
): Promise<void> {
  const db = await getDb();
  if (!db || !payload) return;
  // 移除 base64 的 icon/image，避免 raw_json 過大
  const { icon: _icon, image: _image, ...rest } = payload as Record<string, unknown>;
  const app = (payload.app as string) ?? null;
  const title = (payload.title as string) ?? null;
  const text = (payload.text as string) ?? null;
  const postTime = extractPostTime(payload);

  // 同一則通知被重放 → 不重複存（治本的去重）
  if (await isDuplicateCapture(db, app, title, text, postTime)) return;

  await db.runAsync(
    "INSERT INTO captured_notifications (id, app, title, text, big_text, raw_json, captured_at, post_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    generateId(),
    app,
    title,
    text,
    (payload.bigText as string) ?? null,
    JSON.stringify(rest),
    new Date().toISOString(),
    postTime,
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
    "SELECT id, app, title, text, big_text, raw_json, captured_at, post_time FROM captured_notifications ORDER BY captured_at DESC LIMIT ?",
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
    postTime: r.post_time,
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
    time: "1752206400000",
  },
  {
    app: "tw.com.taishinbank.ccapp",
    title: "信用卡消費通知",
    text: "【信用卡消費通知】您的Richart卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣79元，實際消費資訊以帳單為準，如有疑問請洽客服",
    time: "1752205200000",
  },
  {
    app: "jp.naver.line.android",
    title: "LINE錢包",
    text: "LINE Pay 付款 NT$ 128 付款完成。\n商店名稱: 星巴克",
    time: "1752205260000",
  },
];

export async function insertSampleNotifications(): Promise<void> {
  for (const s of SAMPLE_NOTIFICATIONS) {
    await saveCapturedNotification(s);
  }
}
