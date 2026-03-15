/**
 * 帳戶餘額與總資產換算（含轉帳、多幣別）
 */
import type { Account, CurrencyCode, Transaction } from "../types";

/**
 * 單一帳戶餘額（原幣）：initialBalance + 收入 - 支出，轉帳時轉出減、轉入加
 */
export function computeAccountBalance(
  accountId: string,
  initialBalance: number,
  transactions: Transaction[],
): number {
  let balance = initialBalance;
  for (const t of transactions) {
    if (t.type === "transfer") {
      if (t.accountId === accountId) balance -= t.amount;
      if (t.toAccountId === accountId) balance += t.transferAmount ?? 0;
      continue;
    }
    if (t.accountId !== accountId) continue;
    if (t.type === "income") balance += t.amount;
    else balance -= t.amount;
  }
  return balance;
}

export interface AccountBalanceItem {
  account: Account;
  balance: number;
  balanceInPrimary: number;
}

/**
 * 各帳戶餘額（原幣）與換算成主幣別後的金額
 */
export function getAccountBalancesWithPrimary(
  accounts: Account[],
  transactions: Transaction[],
  ratesToPrimary: Record<string, number>,
  primaryCurrency: CurrencyCode,
): AccountBalanceItem[] {
  return accounts.map((account) => {
    const balance = computeAccountBalance(
      account.id,
      account.initialBalance,
      transactions,
    );
    const rate = account.currency === primaryCurrency
      ? 1
      : (ratesToPrimary[account.currency] ?? 0);
    const balanceInPrimary = balance * rate;
    return { account, balance, balanceInPrimary };
  });
}

/**
 * 總資產（主幣別）= 各帳戶餘額換算成主幣後加總
 */
export function getTotalAssetsInPrimary(
  accounts: Account[],
  transactions: Transaction[],
  ratesToPrimary: Record<string, number>,
  primaryCurrency: CurrencyCode,
): number {
  const items = getAccountBalancesWithPrimary(
    accounts,
    transactions,
    ratesToPrimary,
    primaryCurrency,
  );
  return items.reduce((sum, { balanceInPrimary }) => sum + balanceInPrimary, 0);
}
