/**
 * Phase 3：待確認清單的去重規則（純函式、無 RN/DB 相依，可單元測試）。
 * 規則依使用者決定：
 *  - LINE 同則通知重複貼出 → 同管道、同金額、時間相近、內容一致視為重複，丟棄。
 *  - 台新 App 通知 與 LINE Pay 通知為同一筆時 → 只留台新那筆（LINE Pay 丟棄）。
 */
import type { NotificationSource } from "./notificationParser";

export interface DedupItem {
  id: string;
  bank: string;
  source: NotificationSource;
  amount: number;
  merchant: string | null;
  last4: string | null;
  occurredAt: string;
}

/** 各銀行的預設消費類別 key（使用者指定：台新→飲食、永豐→娛樂） */
export function defaultCategoryForBank(bank: string): string {
  switch (bank) {
    case "台新":
      return "food";
    case "永豐":
      return "entertainment";
    default:
      return "food";
  }
}

function timeDiffSec(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 1000;
}

/** LINE Pay 付款通知（會與該卡的銀行 App 通知重複） */
const isLinePay = (x: DedupItem) => /LINE\s*Pay|LINE錢包|錢包/i.test(x.bank);
/** 來自銀行自己的 App（比 LINE Pay 權威，含末四碼） */
const isBankApp = (x: DedupItem) => x.source === "app";

/**
 * 決定一筆解析結果要不要加入待確認清單，以及要不要取代（刪除）既有的哪些筆。
 * @param candidate 新解析出的一筆
 * @param existing 目前清單裡仍為 pending 的筆
 */
export function decidePendingInsert(
  candidate: DedupItem,
  existing: DedupItem[],
): { insert: boolean; supersedeIds: string[] } {
  const supersedeIds: string[] = [];
  for (const e of existing) {
    if (e.amount !== candidate.amount) continue;

    // 同管道、同金額、時間相近、商店/末四碼一致 → 視為重複（含 LINE 重複貼出）
    if (
      e.bank === candidate.bank &&
      e.source === candidate.source &&
      timeDiffSec(e.occurredAt, candidate.occurredAt) <= 90 &&
      (e.merchant ?? null) === (candidate.merchant ?? null) &&
      (e.last4 ?? null) === (candidate.last4 ?? null)
    ) {
      return { insert: false, supersedeIds: [] };
    }

    // 銀行 App 通知 與 LINE Pay 為同一筆 → 只留銀行 App 那筆
    if (timeDiffSec(e.occurredAt, candidate.occurredAt) <= 150) {
      if (isLinePay(candidate) && isBankApp(e)) {
        return { insert: false, supersedeIds: [] };
      }
      if (isBankApp(candidate) && isLinePay(e)) {
        supersedeIds.push(e.id);
      }
    }
  }
  return { insert: true, supersedeIds };
}
