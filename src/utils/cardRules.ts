/**
 * 刷卡自動記帳「卡片/來源設定」的 DB 存取與預設種子。
 * 純綁定邏輯與型別在 ./cardBinding。
 */
import { getDb } from "../db";
import { generateId } from "./id";
import {
  DEFAULT_CARD_RULES,
  resolveBinding,
  type BindingResult,
  type CardRule,
} from "./cardBinding";

export { resolveBinding };
export type { CardRule, BindingResult };

interface CardRuleRow {
  id: string;
  label: string;
  match_last4: string | null;
  match_keyword: string | null;
  match_app: string | null;
  account_id: string | null;
  category_key: string | null;
  sort_order: number;
}

function rowToRule(r: CardRuleRow): CardRule {
  return {
    id: r.id,
    label: r.label,
    matchLast4: r.match_last4,
    matchKeyword: r.match_keyword,
    matchApp: r.match_app,
    accountId: r.account_id,
    categoryKey: r.category_key,
    sortOrder: r.sort_order,
  };
}

const SEED_FLAG_KEY = "card_rules_seeded";

/** 首次啟用時建立預設規則（用 settings 旗標，避免使用者刪光後又被補回）。 */
export async function ensureCardRulesSeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const flag = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    SEED_FLAG_KEY,
  );
  if (flag?.value === "true") return;
  for (const r of DEFAULT_CARD_RULES) {
    await db.runAsync(
      "INSERT INTO card_binding_rules (id, label, match_last4, match_keyword, match_app, account_id, category_key, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      generateId(),
      r.label,
      r.matchLast4,
      r.matchKeyword,
      r.matchApp,
      r.accountId,
      r.categoryKey,
      r.sortOrder,
      new Date().toISOString(),
    );
  }
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    SEED_FLAG_KEY,
    "true",
  );
}

export async function getCardRules(): Promise<CardRule[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<CardRuleRow>(
    "SELECT id, label, match_last4, match_keyword, match_app, account_id, category_key, sort_order FROM card_binding_rules ORDER BY sort_order, label",
  );
  return rows.map(rowToRule);
}

export async function saveCardRule(rule: CardRule): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    `INSERT INTO card_binding_rules (id, label, match_last4, match_keyword, match_app, account_id, category_key, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       match_last4 = excluded.match_last4,
       match_keyword = excluded.match_keyword,
       match_app = excluded.match_app,
       account_id = excluded.account_id,
       category_key = excluded.category_key,
       sort_order = excluded.sort_order`,
    rule.id,
    rule.label,
    rule.matchLast4,
    rule.matchKeyword,
    rule.matchApp,
    rule.accountId,
    rule.categoryKey,
    rule.sortOrder,
    new Date().toISOString(),
  );
}

export async function deleteCardRule(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync("DELETE FROM card_binding_rules WHERE id = ?", id);
}

/** 建立一條新規則的空白範本（尚未存入 DB）。 */
export function newCardRule(sortOrder: number): CardRule {
  return {
    id: generateId(),
    label: "",
    matchLast4: null,
    matchKeyword: null,
    matchApp: null,
    accountId: null,
    categoryKey: null,
    sortOrder,
  };
}
