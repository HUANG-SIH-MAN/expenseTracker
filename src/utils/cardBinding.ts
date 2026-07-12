/**
 * 刷卡自動記帳「卡片/來源設定」的型別與純綁定邏輯（無 RN/DB 相依，可單元測試）。
 * 綁定優先序：末四碼 > App 套件 > 關鍵字（比對通知標題/內文）。
 */

export interface CardRule {
  id: string;
  label: string;
  matchLast4: string | null;
  matchKeyword: string | null;
  matchApp: string | null;
  accountId: string | null;
  categoryKey: string | null;
  sortOrder: number;
}

export interface BindingResult {
  accountId: string | null;
  categoryKey: string | null;
  label: string | null;
}

/** 預設規則（首次啟用時建立，帳戶留空由使用者設定）。 */
export const DEFAULT_CARD_RULES: Omit<CardRule, "id">[] = [
  {
    label: "台新",
    matchLast4: null,
    matchKeyword: "台新",
    matchApp: "tw.com.taishinbank.ccapp",
    accountId: null,
    categoryKey: "food",
    sortOrder: 0,
  },
  {
    label: "永豐",
    matchLast4: null,
    matchKeyword: "永豐",
    matchApp: null,
    accountId: null,
    categoryKey: "entertainment",
    sortOrder: 1,
  },
  {
    label: "LINE Pay",
    matchLast4: null,
    matchKeyword: "LINE錢包",
    matchApp: null,
    accountId: null,
    categoryKey: "food",
    sortOrder: 2,
  },
];

/**
 * 依規則決定綁定：末四碼 > App 套件 > 關鍵字。找不到回傳全 null。
 */
export function resolveBinding(
  rules: CardRule[],
  last4: string | null,
  app: string | null,
  content: string,
): BindingResult {
  const none: BindingResult = { accountId: null, categoryKey: null, label: null };
  if (rules.length === 0) return none;

  const pick = (r: CardRule): BindingResult => ({
    accountId: r.accountId,
    categoryKey: r.categoryKey,
    label: r.label || null,
  });

  if (last4) {
    const byLast4 = rules.find((r) => r.matchLast4 && r.matchLast4 === last4);
    if (byLast4) return pick(byLast4);
  }
  if (app) {
    const byApp = rules.find((r) => r.matchApp && r.matchApp === app);
    if (byApp) return pick(byApp);
  }
  const byKeyword = rules.find(
    (r) => r.matchKeyword && content.includes(r.matchKeyword),
  );
  if (byKeyword) return pick(byKeyword);

  return none;
}
