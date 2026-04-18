/**
 * 統計：依月/年篩選交易、總收支、類別分組占比
 */
import type { Transaction, TransactionType } from '../types';

export const PERIOD_MONTH = 'month';
export const PERIOD_YEAR = 'year';
export type PeriodKind = typeof PERIOD_MONTH | typeof PERIOD_YEAR;

const PAD_LEN = 2;

function padMonth(month: number): string {
  return String(month).padStart(PAD_LEN, '0');
}

/**
 * 依期別篩選交易：月 = 該年該月；年 = 該年
 */
export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: PeriodKind,
  year: number,
  month?: number
): Transaction[] {
  if (period === PERIOD_YEAR) {
    const prefix = `${year}-`;
    return transactions.filter((t) => t.date.startsWith(prefix));
  }
  const prefix = `${year}-${padMonth(month ?? 1)}-`;
  return transactions.filter((t) => t.date.startsWith(prefix));
}

export interface PeriodTotals {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

/**
 * 計算當期總收入、總支出、結餘
 * accountCostBasisMap 有提供時，外幣支出用換匯均價換算成主幣
 */
export function getPeriodTotals(
  transactions: Transaction[],
  period: PeriodKind,
  year: number,
  month?: number,
  accountCostBasisMap?: Map<string, number>,
): PeriodTotals {
  const list = filterTransactionsByPeriod(transactions, period, year, month);
  let totalIncome = 0;
  let totalExpense = 0;
  for (const t of list) {
    if (t.type === 'transfer') continue;
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      const rate = accountCostBasisMap?.get(t.accountId ?? '') ?? 1;
      totalExpense += t.amount * rate;
    }
  }
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
}

export interface CategorySlice {
  category: string;
  amount: number;
  percentage: number;
}

/**
 * 依類型（收入/支出）分組加總，回傳各類別金額與占比（百分比）
 * total 為該類型當期總和，用於計算百分比；若為 0 則 percentage 為 0
 * accountCostBasisMap 有提供時，外幣支出用換匯均價換算成主幣
 */
export function getCategoryBreakdown(
  transactions: Transaction[],
  period: PeriodKind,
  year: number,
  type: TransactionType,
  month?: number,
  accountCostBasisMap?: Map<string, number>,
): CategorySlice[] {
  const list = filterTransactionsByPeriod(transactions, period, year, month);
  const byType = list.filter((t) => t.type === type);

  const map = new Map<string, number>();
  for (const t of byType) {
    const rate = type === 'expense' ? (accountCostBasisMap?.get(t.accountId ?? '') ?? 1) : 1;
    const key = t.category;
    map.set(key, (map.get(key) ?? 0) + t.amount * rate);
  }

  const total = Array.from(map.values()).reduce((sum, v) => sum + v, 0);
  const slices: CategorySlice[] = [];
  map.forEach((amount, category) => {
    const percentage = total > 0 ? (amount / total) * 100 : 0;
    slices.push({ category, amount, percentage });
  });
  slices.sort((a, b) => b.amount - a.amount);
  return slices;
}

/**
 * 依期別與類別篩選交易（供「類別期間明細」使用）
 */
export function filterTransactionsByPeriodAndCategory(
  transactions: Transaction[],
  period: PeriodKind,
  year: number,
  type: TransactionType,
  categoryKey: string,
  month?: number
): Transaction[] {
  const list = filterTransactionsByPeriod(transactions, period, year, month);
  return list.filter((t) => t.type === type && t.category === categoryKey);
}
