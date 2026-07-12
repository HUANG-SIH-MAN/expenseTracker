/**
 * 通用刷卡通知解析器（不綁特定銀行）。
 * 台灣的信用卡消費通知格式相近（末四碼、金額…元/NT$、商店名稱），
 * 所以用一組通用規則抽取「金額、末四碼、商店、時間」，多數銀行（含未來新卡）免改即可。
 * 純函式、無副作用，方便單元測試。解析不出來或非消費通知回傳 null。
 */

/** 通知來源管道 */
export type NotificationSource = "line" | "app";

export interface ParsedTransaction {
  /** 消費金額（正數） */
  amount: number;
  /** 幣別，目前一律 TWD */
  currency: string;
  /** 商店名稱，解析不到為 null */
  merchant: string | null;
  /** 卡號末四碼，解析不到為 null（綁定帳戶的主要依據） */
  last4: string | null;
  /** 消費發生時間 ISO 字串；通知只給到分鐘、年份沿用擷取時間 */
  occurredAt: string;
  /** 銀行/來源的最佳猜測（取自通知標題），最終顯示名稱由設定覆蓋 */
  bank: string;
  /** 來源管道：LINE 或 銀行 App */
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

/** 合併 bigText / text / title（去重）作為可解析內容 */
function contentOf(n: ParsableNotification): string {
  const parts = [n.bigText, n.text, n.title]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0);
  const unique = parts.filter((s, i) => parts.indexOf(s) === i);
  return unique.join("\n");
}

/** "1,234" -> 1234；失敗回傳 null */
function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

/** 末四碼：末四碼 / 末4碼 / 尾號 / 卡號末四碼 等 */
function extractLast4(text: string): string | null {
  const m = text.match(/(?:末四碼|末4碼|末碼|尾[數號]|卡號末四碼)\s*[:：]?\s*(\d{4})/);
  return m ? m[1] : null;
}

/** 金額：優先抓有幣別標記的（台幣/新臺幣/NT$/NTD/TWD/金額），退而求其次抓「…元」 */
function extractAmount(text: string): number | null {
  const withCurrency = text.match(
    /(?:台幣|新臺幣|新台幣|NT\$|NTD|TWD|金額)\s*[:：]?\s*([\d,]+)/i,
  );
  const byCurrency = toNumber(withCurrency?.[1]);
  if (byCurrency != null) return byCurrency;
  const withYuan = text.match(/([\d,]+)\s*元/);
  return toNumber(withYuan?.[1]);
}

/** 商店：商店名稱：X ；或「在X消費/刷卡」 */
function extractMerchant(text: string): string | null {
  const byLabel = text.match(/商店名稱[:：]\s*([^\n，。]+)/)?.[1]?.trim();
  if (byLabel) return byLabel;
  // 「在[商店]消費/刷卡」：商店名不以數字開頭，避免抓到日期
  const byAt = text.match(/在\s*([^\n，。\d][^\n，。]*?)\s*(?:消費|刷卡)/)?.[1]?.trim();
  if (byAt) return byAt;
  return null;
}

function extractOccurredAt(text: string, capturedAt: string): string {
  const m = text.match(/(\d{1,2})\/(\d{1,2})[\s\-]+(\d{1,2}):(\d{2})/);
  if (!m) return capturedAt;
  return buildOccurredAt(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), capturedAt);
}

const CONSUMPTION_WORDS = /刷卡|消費|付款|交易|授權|扣款/;
// 帳單/繳款提醒等「非單筆消費」的通知，排除（用精準片語，避免誤擋含「以帳單為準」的消費通知）
const NON_PURCHASE_WORDS = /本期帳單|帳單金額|應繳|待繳|繳款截止|循環利息|紅利點數/;

/**
 * 解析單一通知為消費資訊；非消費通知或無法解析回傳 null。
 * 判定為消費的條件：有金額，且（有末四碼 或 含刷卡/消費等關鍵字），且非帳單/繳款提醒。
 */
export function parseNotification(n: ParsableNotification): ParsedTransaction | null {
  const app = n.app ?? "";
  const content = contentOf(n);
  if (content.length === 0) return null;
  if (NON_PURCHASE_WORDS.test(content)) return null;

  const amount = extractAmount(content);
  if (amount == null) return null;

  const last4 = extractLast4(content);
  const hasConsumptionWord = CONSUMPTION_WORDS.test(content);
  if (last4 == null && !hasConsumptionWord) return null;

  const source: NotificationSource = app === LINE_APP ? "line" : "app";
  const bank =
    n.title && n.title.trim().length > 0 ? n.title.trim() : app || "未知來源";

  return {
    amount,
    currency: "TWD",
    merchant: extractMerchant(content),
    last4,
    occurredAt: extractOccurredAt(content, n.capturedAt),
    bank,
    source,
  };
}
