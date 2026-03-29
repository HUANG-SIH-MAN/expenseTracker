/**
 * 預算：當月可支配、剩餘日加權、今日建議預算
 */
import type { BudgetSettings, MonthlyFixedItem, RecurringItem, Transaction } from '../types';
import { BUDGET_WEEKEND_DAY_INDICES } from '../constants';
import { filterTransactionsByPeriod, PERIOD_MONTH } from './statistics';

const PAD_LEN = 2;

function padMonth(month: number): string {
  return String(month).padStart(PAD_LEN, '0');
}

/**
 * 從今天到當月最後一天的所有日期（含今天），以及是否為假日
 */
export function getRemainingDateKeysInMonth(
  todayKey: string
): { dateKey: string; isWeekend: boolean }[] {
  const [y, m] = todayKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const todayDate = parseInt(todayKey.slice(8, 10), 10);
  const result: { dateKey: string; isWeekend: boolean }[] = [];
  const monthStr = padMonth(m);
  for (let d = todayDate; d <= lastDay; d++) {
    const dateKey = `${y}-${monthStr}-${String(d).padStart(PAD_LEN, '0')}`;
    const date = new Date(y, m - 1, d);
    const dayIndex = date.getDay();
    const isWeekend = BUDGET_WEEKEND_DAY_INDICES.includes(dayIndex);
    result.push({ dateKey, isWeekend });
  }
  return result;
}

export interface RemainingWeightedDaysResult {
  /** 剩餘天數（含今天） */
  remainingDays: number;
  /** 剩餘加權天數總和 */
  weightedSum: number;
  /** 今天的權重 */
  todayWeight: number;
  /** 假日天數 */
  weekendCount: number;
  /** 平日的天數 */
  weekdayCount: number;
}

/**
 * 計算當月剩餘日（含今天）的加權總和與今日權重
 */
export function getRemainingWeightedDays(
  todayKey: string,
  weekdayWeight: number,
  weekendWeight: number
): RemainingWeightedDaysResult {
  const days = getRemainingDateKeysInMonth(todayKey);
  let weightedSum = 0;
  let weekendCount = 0;
  let weekdayCount = 0;
  const first = days[0];
  let todayWeight = weekdayWeight;
  for (const { isWeekend } of days) {
    const w = isWeekend ? weekendWeight : weekdayWeight;
    weightedSum += w;
    if (isWeekend) weekendCount += 1;
    else weekdayCount += 1;
  }
  if (first?.isWeekend) todayWeight = weekendWeight;
  return {
    remainingDays: days.length,
    weightedSum,
    todayWeight,
    weekendCount,
    weekdayCount,
  };
}

/**
 * 當月日常可支配預算（預估）= 月收入 − 固定/投資預估總和
 */
export function getMonthlyDisposable(
  monthIncome: number,
  fixedEstimatedTotal: number
): number {
  return Math.max(0, monthIncome - fixedEstimatedTotal);
}

/**
 * 取得固定項目實際使用的估算金額（TWD）：
 * 1. 有連結 RecurringItem → 用 recurringItem.amount
 * 2. 有 USD 原始金額 + 匯率 → 動態換算
 * 3. fallback → 儲存的 estimatedAmount（TWD 快照）
 */
export function resolveFixedItemAmount(
  item: MonthlyFixedItem,
  recurringMap: Map<string, RecurringItem>,
  ratesToPrimary?: Record<string, number>
): number {
  if (item.recurringItemId) {
    const rec = recurringMap.get(item.recurringItemId);
    if (rec) return rec.amount;
  }
  if (
    item.currency &&
    item.currency !== 'TWD' &&
    item.originalAmount != null &&
    ratesToPrimary
  ) {
    const rate = ratesToPrimary[item.currency] ?? 0;
    return item.originalAmount * rate;
  }
  return item.estimatedAmount;
}

/**
 * 固定/投資預估總和（月固定項目加總）
 */
export function getFixedEstimatedTotal(
  monthlyFixedItems: MonthlyFixedItem[],
  ratesToPrimary?: Record<string, number>,
  recurringItems?: RecurringItem[]
): number {
  const recurringMap = new Map((recurringItems ?? []).map((r) => [r.id, r]));
  return monthlyFixedItems.reduce(
    (sum, item) => sum + resolveFixedItemAmount(item, recurringMap, ratesToPrimary),
    0
  );
}

/**
 * 當月至今「日常」已支出（排除已連結月預算或年度預算的交易）
 */
export function getDailyExpenseSoFar(
  transactions: Transaction[],
  year: number,
  month: number,
  upToDateKey: string,
): number {
  const list = filterTransactionsByPeriod(
    transactions,
    PERIOD_MONTH,
    year,
    month
  );
  let sum = 0;
  for (const t of list) {
    if (t.type !== 'expense') continue;
    if (t.date > upToDateKey) continue;
    if (t.annualBudgetEntryId != null) continue;
    if (t.monthlyFixedItemId != null) continue;
    sum += t.amount;
  }
  return sum;
}

/**
 * 剩餘可支配 = 當月日常可支配（預估）− 當月至今日常已支出
 */
export function getRemainingDisposable(
  monthlyDisposable: number,
  dailyExpenseSoFar: number
): number {
  return Math.max(0, monthlyDisposable - dailyExpenseSoFar);
}

/**
 * 今日建議預算 = 剩餘可支配 × (今日權重 / 剩餘加權天數總和)
 * 若無剩餘天數則回傳 0
 */
export function getTodaySuggestedBudget(
  remainingDisposable: number,
  weightedSum: number,
  todayWeight: number
): number {
  if (weightedSum <= 0) return 0;
  return (remainingDisposable * todayWeight) / weightedSum;
}

/**
 * 當月收入：依記帳加總；
 * 若為 0 → 用每月固定收入項目（repeat=monthly）加總；
 * 若仍為 0 → 用設定的預設月收入
 */
export function getMonthIncome(
  transactions: Transaction[],
  year: number,
  month: number,
  defaultMonthlyIncome: number,
  recurringItems?: RecurringItem[]
): number {
  const list = filterTransactionsByPeriod(
    transactions,
    PERIOD_MONTH,
    year,
    month
  );
  const transactionTotal = list
    .filter((t) => t.type === 'income' && t.annualBudgetEntryId == null)
    .reduce((sum, t) => sum + t.amount, 0);
  if (transactionTotal > 0) return transactionTotal;

  if (recurringItems && recurringItems.length > 0) {
    const recurringIncomeTotal = recurringItems
      .filter((r) => r.type === 'income' && r.repeat === 'monthly')
      .reduce((sum, r) => sum + r.amount, 0);
    if (recurringIncomeTotal > 0) return recurringIncomeTotal;
  }

  return defaultMonthlyIncome;
}

/**
 * 彙總：依設定與交易計算當月剩餘可支配與今日建議預算
 */
export interface BudgetSummary {
  monthlyIncome: number;
  fixedEstimatedTotal: number;
  monthlyDisposable: number;
  dailyExpenseSoFar: number;
  remainingDisposable: number;
  remainingDays: number;
  weekendCount: number;
  weekdayCount: number;
  todaySuggestedBudget: number;
}

export function getBudgetSummary(
  todayKey: string,
  transactions: Transaction[],
  monthlyFixedItems: MonthlyFixedItem[],
  settings: BudgetSettings,
  ratesToPrimary?: Record<string, number>,
  recurringItems?: RecurringItem[]
): BudgetSummary | null {
  const [year, month] = todayKey.split('-').map(Number);
  const monthIncome = getMonthIncome(
    transactions,
    year,
    month,
    settings.defaultMonthlyIncome,
    recurringItems
  );
  const fixedEstimatedTotal = getFixedEstimatedTotal(monthlyFixedItems, ratesToPrimary, recurringItems);
  const monthlyDisposable = getMonthlyDisposable(
    monthIncome,
    fixedEstimatedTotal
  );
  const dailyExpenseSoFar = getDailyExpenseSoFar(
    transactions,
    year,
    month,
    todayKey,
  );
  const remainingDisposable = getRemainingDisposable(
    monthlyDisposable,
    dailyExpenseSoFar
  );
  const weighted = getRemainingWeightedDays(
    todayKey,
    settings.weekdayWeight,
    settings.weekendWeight
  );
  const todaySuggestedBudget = getTodaySuggestedBudget(
    remainingDisposable,
    weighted.weightedSum,
    weighted.todayWeight
  );
  return {
    monthlyIncome: monthIncome,
    fixedEstimatedTotal,
    monthlyDisposable,
    dailyExpenseSoFar,
    remainingDisposable,
    remainingDays: weighted.remainingDays,
    weekendCount: weighted.weekendCount,
    weekdayCount: weighted.weekdayCount,
    todaySuggestedBudget,
  };
}
