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
 * sortedTransactions 必須已依 date/createdAt 排序；accountMap 由呼叫端傳入以避免重複建立。
 * 回傳 null 表示該帳戶尚無任何主幣換匯記錄
 */
export function calculateForeignAccountCostBasis(
  account: Account,
  sortedTransactions: Transaction[],
  accountMap: Map<string, Account>,
  primaryCurrency: CurrencyCode,
): ForeignAccountCostBasis | null {
  if (account.currency === primaryCurrency) return null;

  let foreignBal = account.initialBalance;
  let primaryCost = 0;
  let avgRate = 0;
  let hasExchange = false;

  for (const t of sortedTransactions) {
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
 * 建立所有外幣帳戶的完整換匯成本明細表 (accountId → ForeignAccountCostBasis)
 * 排序只做一次，供需要完整資料（均價、外幣餘額、主幣成本）的畫面使用
 */
export function buildForeignCostBasisMap(
  accounts: Account[],
  transactions: Transaction[],
  primaryCurrency: CurrencyCode,
): Map<string, ForeignAccountCostBasis> {
  const foreignAccounts = accounts.filter((a) => a.currency !== primaryCurrency);
  const map = new Map<string, ForeignAccountCostBasis>();
  if (foreignAccounts.length === 0) return map;

  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  for (const account of foreignAccounts) {
    const basis = calculateForeignAccountCostBasis(account, sorted, accountMap, primaryCurrency);
    if (basis != null) map.set(account.id, basis);
  }
  return map;
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
  const detailMap = buildForeignCostBasisMap(accounts, transactions, primaryCurrency);
  const map = new Map<string, number>();
  for (const [id, basis] of detailMap) {
    if (basis.avgRateToPrimary > 0) map.set(id, basis.avgRateToPrimary);
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
