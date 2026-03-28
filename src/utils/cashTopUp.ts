import type { Account, CashTopUpRule, Transaction } from "../types";
import { computeAccountBalance } from "./balance";

export interface SyncCashTopUpResult {
  createdCount: number;
  newTransfers: Transaction[];
}

function toDateKey(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function syncCashTopUp(params: {
  rules: CashTopUpRule[];
  accounts: Account[];
  transactions: Transaction[];
  now: Date;
  generateId: () => string;
}): SyncCashTopUpResult {
  const { rules, accounts, transactions, now, generateId } = params;
  const todayKey = toDateKey(now);
  const nowIso = now.toISOString();
  const newTransfers: Transaction[] = [];

  for (const rule of rules) {
    if (!rule.isEnabled) continue;
    const targetAccount = accounts.find((a) => a.id === rule.targetAccountId);
    if (targetAccount == null) continue;
    const sourceExists = accounts.some((a) => a.id === rule.sourceAccountId);
    if (!sourceExists) continue;

    const balance = computeAccountBalance(
      rule.targetAccountId,
      targetAccount.initialBalance,
      [...transactions, ...newTransfers],
    );
    if (balance >= rule.threshold) continue;

    const transfer: Transaction = {
      id: generateId(),
      type: "transfer",
      amount: rule.topUpAmount,
      date: todayKey,
      category: `cash-topup-${rule.id}`,
      accountId: rule.sourceAccountId,
      toAccountId: rule.targetAccountId,
      transferAmount: rule.topUpAmount,
      isSystemGenerated: true,
      systemGeneratedType: "cash_topup",
      lockedReason: "cash_topup",
      createdAt: nowIso,
    };
    newTransfers.push(transfer);
  }

  return { createdCount: newTransfers.length, newTransfers };
}
