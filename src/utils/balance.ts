/**
 * 帳戶餘額與總資產換算（含轉帳、多幣別）
 */
import type { Account, CurrencyCode, Transaction } from "../types";

export interface ForeignAccountCostBasis {
  avgRateToPrimary: number;
  currentForeignBalance: number;
  currentPrimaryCost: number;
}

/**
 * 計算外幣帳戶的加權平均換匯成本（AVCO）
 * 以主幣→外幣的換匯交易為基礎，動態計算當下均價與持有成本
 * 回傳 null 表示該帳戶尚無任何主幣換匯記錄
 */
export function calculateForeignAccountCostBasis(
  account: Account,
  allTransactions: Transaction[],
  allAccounts: Account[],
  primaryCurrency: CurrencyCode,
): ForeignAccountCostBasis | null {
  if (account.currency === primaryCurrency) return null;

  const sorted = [...allTransactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  let foreignBal = account.initialBalance;
  let primaryCost = 0;
  let avgRate = 0;
  let hasExchange = false;

  for (const t of sorted) {
    if (t.type === 'transfer') {
      if (t.toAccountId === account.id) {
        const fromAccount = accountMap.get(t.accountId ?? '');
        if (fromAccount?.currency === primaryCurrency) {
          const foreignReceived = t.transferAmount ?? 0;
          const primaryPaid = t.amount;
          if (foreignReceived > 0) {
            const newTotal = foreignBal + foreignReceived;
            avgRate = (primaryCost + primaryPaid) / newTotal;
            foreignBal = newTotal;
            primaryCost = foreignBal * avgRate;
            hasExchange = true;
          }
        } else {
          foreignBal += t.transferAmount ?? 0;
        }
      } else if (t.accountId === account.id) {
        primaryCost -= t.amount * avgRate;
        foreignBal -= t.amount;
      }
    } else if (t.accountId === account.id) {
      if (t.type === 'income') {
        foreignBal += t.amount;
        primaryCost += t.amount * avgRate;
      } else if (t.type === 'expense') {
        primaryCost -= t.amount * avgRate;
        foreignBal -= t.amount;
      }
    }
  }

  if (!hasExchange) return null;

  return {
    avgRateToPrimary: avgRate,
    currentForeignBalance: foreignBal,
    currentPrimaryCost: Math.max(0, primaryCost),
  };
}

/**
 * 建立所有外幣帳戶的換匯成本均價對應表 (accountId → avgRate)
 * 主幣帳戶或無換匯記錄的帳戶不會出現在 Map 中
 */
export function buildAccountCostBasisMap(
  accounts: Account[],
  transactions: Transaction[],
  primaryCurrency: CurrencyCode,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const account of accounts) {
    if (account.currency === primaryCurrency) continue;
    const basis = calculateForeignAccountCostBasis(account, transactions, accounts, primaryCurrency);
    if (basis != null && basis.avgRateToPrimary > 0) {
      map.set(account.id, basis.avgRateToPrimary);
    }
  }
  return map;
}

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
