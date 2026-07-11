/**
 * Phase 2：把擷取到的銀行/LINE 通知文字，解析成一筆消費資訊。
 * 目前支援：永豐（走 LINE）、台新（走台新 App）、LINE Pay（走 LINE）。
 * 純函式、無副作用，方便單元測試。解析不出來回傳 null。
 */

/** 通知來源管道 */
export type NotificationSource = "line" | "app";

export interface ParsedTransaction {
  /** 消費金額（正數） */
  amount: number;
  /** 幣別，目前一律 TWD */
  currency: string;
  /** 商店名稱，解析不到為 null（例如台新 App 通知不含商店名） */
  merchant: string | null;
  /** 卡號末四碼，解析不到為 null（例如 LINE Pay 不含末四碼） */
  last4: string | null;
  /** 消費發生時間 ISO 字串；通知只給到分鐘、年份沿用擷取時間 */
  occurredAt: string;
  /** 銀行/管道名稱，如 '永豐'、'台新'、'LINE Pay' */
  bank: string;
  /** 來源管道 */
  source: NotificationSource;
}

/** 解析器輸入（對應 CapturedNotification 的子集） */
export interface ParsableNotification {
  app: string | null;
  title: string | null;
  text: string | null;
  bigText: string | null;
  /** 擷取時間 ISO，用來補通知缺少的年份 */
  capturedAt: string;
}

const LINE_APP = "jp.naver.line.android";
const TAISHIN_APP = "tw.com.taishinbank.ccapp";

/** 取通知的主要內文（優先 bigText，較完整） */
function contentOf(n: ParsableNotification): string {
  return (n.bigText && n.bigText.trim().length > 0 ? n.bigText : n.text) ?? "";
}

/** "1,234" -> 1234；解析失敗回傳 null */
function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 通知只給 MM/DD HH:MM，用擷取時間補年份。
 * 若補完後日期落在擷取時間之後超過 2 天（跨年通知），退回前一年。
 */
function buildOccurredAt(
  month: number,
  day: number,
  hour: number,
  minute: number,
  capturedAt: string,
): string {
  const captured = new Date(capturedAt);
  const year = Number.isNaN(captured.getTime())
    ? new Date().getFullYear()
    : captured.getFullYear();
  let d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (!Number.isNaN(captured.getTime()) && d.getTime() - captured.getTime() > 2 * 86400000) {
    d = new Date(year - 1, month - 1, day, hour, minute, 0, 0);
  }
  return d.toISOString();
}

function extractLast4(text: string): string | null {
  const m = text.match(/末四碼\s*(\d{4})/);
  return m ? m[1] : null;
}

/** 台新 App：「您的Richart卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣79元…」 */
function parseTaishinApp(n: ParsableNotification): ParsedTransaction | null {
  const text = contentOf(n);
  const amount = parseAmount(text.match(/新臺幣\s*([\d,]+)\s*元/)?.[1]);
  if (amount == null) return null;
  const dt = text.match(/於\s*(\d{1,2})\/(\d{1,2})[-\s]+(\d{1,2}):(\d{2})/);
  const occurredAt = dt
    ? buildOccurredAt(Number(dt[1]), Number(dt[2]), Number(dt[3]), Number(dt[4]), n.capturedAt)
    : n.capturedAt;
  return {
    amount,
    currency: "TWD",
    merchant: null, // 台新 App 通知不含商店名
    last4: extractLast4(text),
    occurredAt,
    bank: "台新",
    source: "app",
  };
}

/** 永豐（走 LINE）：「末四碼6908感謝07/11 12:10刷卡台幣65元，商店名稱:大全聯，實際商店名稱」 */
function parseSinoPacLine(n: ParsableNotification): ParsedTransaction | null {
  const text = contentOf(n);
  const amount = parseAmount(text.match(/台幣\s*([\d,]+)\s*元/)?.[1]);
  if (amount == null) return null;
  const dt = text.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  const occurredAt = dt
    ? buildOccurredAt(Number(dt[1]), Number(dt[2]), Number(dt[3]), Number(dt[4]), n.capturedAt)
    : n.capturedAt;
  const merchantRaw = text.match(/商店名稱[:：]\s*(.+?)(?:，實際商店名稱|，|。|$)/)?.[1]?.trim();
  return {
    amount,
    currency: "TWD",
    merchant: merchantRaw && merchantRaw.length > 0 ? merchantRaw : null,
    last4: extractLast4(text),
    occurredAt,
    bank: "永豐",
    source: "line",
  };
}

/** LINE Pay（走 LINE，title=LINE錢包）：「LINE Pay 付款 NT$ 79 付款完成。商店名稱: IKEA宜家家居」 */
function parseLinePay(n: ParsableNotification): ParsedTransaction | null {
  const text = contentOf(n);
  const amount = parseAmount(text.match(/NT\$\s*([\d,]+)/)?.[1]);
  if (amount == null) return null;
  const merchantRaw = text.match(/商店名稱[:：]\s*(.+?)(?:。|，|$)/)?.[1]?.trim();
  return {
    amount,
    currency: "TWD",
    merchant: merchantRaw && merchantRaw.length > 0 ? merchantRaw : null,
    last4: null,
    occurredAt: n.capturedAt,
    bank: "LINE Pay",
    source: "line",
  };
}

/**
 * 解析單一通知為消費資訊；非消費通知或無法解析回傳 null。
 */
export function parseNotification(n: ParsableNotification): ParsedTransaction | null {
  const app = n.app ?? "";
  const title = n.title ?? "";
  const text = contentOf(n);

  // 台新 App
  if (app === TAISHIN_APP) {
    return parseTaishinApp(n);
  }

  // 走 LINE 的通知，依標題/內容再細分
  if (app === LINE_APP) {
    if (title.includes("LINE錢包") || text.includes("LINE Pay")) {
      return parseLinePay(n);
    }
    if (title.includes("永豐") || text.includes("永豐")) {
      return parseSinoPacLine(n);
    }
  }

  return null;
}
