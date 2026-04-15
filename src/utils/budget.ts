/**
 * 預算：當月可支配、剩餘日加權、今日建議預算
 */
import type { BudgetSettings, MonthlyFixedItem, RecurringItem, Transaction } from '../types';
import { BUDGET_WEEKEND_DAY_INDICES } from '../constants';
import { filterTransactionsByPeriod, PERIOD_MONTH } from './statistics';
import { getCachedTaiwanHolidays, prefetchNextYearIfDecember } from './taiwanHolidays';

const PAD_LEN = 2;

function padMonth(month: number): string {
  return String(month).padStart(PAD_LEN, '0');
}

/**
 * 從今天到當月最後一天的所有日期（含今天），以及是否為假日。
 * isWeekend 為 true 表示應使用假日權重（六日 或 國定假日）。
 * @param nationalHolidays 當年國定假日日期清單（YYYY-MM-DD），由呼叫方提供以避免在迴圈內 async
 */
export function getRemainingDateKeysInMonth(
  todayKey: string,
  nationalHolidays: string[] = []
): { dateKey: string; isWeekend: boolean }[] {
  const [y, m] = todayKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const todayDate = parseInt(todayKey.slice(8, 10), 10);
  const result: { dateKey: string; isWeekend: boolean }[] = [];
  const monthStr = padMonth(m);
  const holidaySet = new Set(nationalHolidays);
  for (let d = todayDate; d <= lastDay; d++) {
    const dateKey = `${y}-${monthStr}-${String(d).padStart(PAD_LEN, '0')}`;
    const date = new Date(y, m - 1, d);
    const dayIndex = date.getDay();
    const isWeekend =
      BUDGET_WEEKEND_DAY_INDICES.includes(dayIndex) || holidaySet.has(dateKey);
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
 * @param nationalHolidays 當年國定假日日期清單（YYYY-MM-DD）
 */
export function getRemainingWeightedDays(
  todayKey: string,
  weekdayWeight: number,
  weekendWeight: number,
  nationalHolidays: string[] = []
): RemainingWeightedDaysResult {
  const days = getRemainingDateKeysInMonth(todayKey, nationalHolidays);
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
  fixedEstimatedTotal: number,
  savingTarget: number
): number {
  return Math.max(0, monthIncome - fixedEstimatedTotal - Math.max(0, savingTarget));
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
 * 當月至今「日常」已支出（排除已連結月預算或年度預算或年費分攤的交易）
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
    if (t.amortizationMonths != null) continue;
    sum += t.amount;
  }
  return sum;
}

/**
 * 單筆分攤交易在指定月份的分攤金額：
 * - 付款月（第一個月）= floor(amount/N) + remainder
 * - 後續各月 = floor(amount/N)
 * - 不在覆蓋範圍內回傳 0
 */
function getAmortizedAmountForMonth(
  t: Transaction,
  year: number,
  month: number
): number {
  const n = t.amortizationMonths!;
  const [py, pm] = t.date.split('-').map(Number);
  // 計算目標月份距付款月的偏移
  const offset = (year - py) * 12 + (month - pm);
  if (offset < 0 || offset >= n) return 0;
  const base = Math.floor(t.amount / n);
  const remainder = t.amount - base * n;
  return offset === 0 ? base + remainder : base;
}

/**
 * 當月所有分攤交易的合計扣除額
 */
export function getAmortizedExpenseForMonth(
  transactions: Transaction[],
  year: number,
  month: number
): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.amortizationMonths == null) continue;
    sum += getAmortizedAmountForMonth(t, year, month);
  }
  return sum;
}

/**
 * 當月有分攤的交易明細（供 UI 顯示清單）
 */
export interface AmortizedItem {
  transactionId: string;
  note: string;
  monthlyAmount: number;
  totalAmount: number;
  amortizationMonths: number;
  paymentDate: string;
  /** 分攤到期月份，格式 YYYY-MM */
  endYearMonth: string;
}

export function getAmortizedItemsForMonth(
  transactions: Transaction[],
  year: number,
  month: number
): AmortizedItem[] {
  const result: AmortizedItem[] = [];
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.amortizationMonths == null) continue;
    const monthlyAmount = getAmortizedAmountForMonth(t, year, month);
    if (monthlyAmount <= 0) continue;
    const [py, pm] = t.date.split('-').map(Number);
    const endTotalMonths = pm + t.amortizationMonths - 1;
    const endYear = py + Math.floor((endTotalMonths - 1) / 12);
    const endMonth = ((endTotalMonths - 1) % 12) + 1;
    const endYearMonth = `${endYear}-${String(endMonth).padStart(2, '0')}`;
    result.push({
      transactionId: t.id,
      note: t.note ?? t.category,
      monthlyAmount,
      totalAmount: t.amount,
      amortizationMonths: t.amortizationMonths,
      paymentDate: t.date,
      endYearMonth,
    });
  }
  return result;
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

const ZERO_AMOUNT = 0;

/**
 * 當月收入：
 * 1. 先使用每月固定收入（repeat=monthly）加總作為基礎收入
 * 2. 再加上當月「其他收入」記帳（排除年度預算連結與固定收支自動帶入）
 */
export function getMonthIncome(
  transactions: Transaction[],
  year: number,
  month: number,
  recurringItems?: RecurringItem[]
): number {
  const list = filterTransactionsByPeriod(
    transactions,
    PERIOD_MONTH,
    year,
    month
  );
  const recurringIncomeTotal = (recurringItems ?? [])
    .filter((r) => r.type === 'income' && r.repeat === 'monthly')
    .reduce((sum, r) => sum + r.amount, ZERO_AMOUNT);
  const additionalIncomeTotal = list
    .filter(
      (t) =>
        t.type === 'income' &&
        t.annualBudgetEntryId == null &&
        t.recurringId == null
    )
    .reduce((sum, t) => sum + t.amount, ZERO_AMOUNT);
  return recurringIncomeTotal + additionalIncomeTotal;
}

/**
 * 彙總：依設定與交易計算當月剩餘可支配與今日建議預算
 */
export interface BudgetSummary {
  monthlyIncome: number;
  fixedEstimatedTotal: number;
  /** 當月年費分攤合計（已含在 fixedEstimatedTotal 內） */
  amortizedTotal: number;
  savingTarget: number;
  monthlyDisposable: number;
  dailyExpenseSoFar: number;
  remainingDisposable: number;
  remainingDays: number;
  weekendCount: number;
  weekdayCount: number;
  todaySuggestedBudget: number;
}

export async function getBudgetSummary(
  todayKey: string,
  transactions: Transaction[],
  monthlyFixedItems: MonthlyFixedItem[],
  settings: BudgetSettings,
  savingTarget: number,
  ratesToPrimary?: Record<string, number>,
  recurringItems?: RecurringItem[],
  /** 已載入的國定假日清單；傳入時跳過內部抓取，避免重複讀取 */
  preloadedHolidays?: string[]
): Promise<BudgetSummary | null> {
  const [year, month] = todayKey.split('-').map(Number);
  // 若呼叫方已提供假日清單則直接使用，否則自行取得（讀快取或呼叫 API）
  const nationalHolidays = preloadedHolidays ?? await getCachedTaiwanHolidays(year);
  // 12月時非同步預抓次年假日（fire-and-forget）
  void prefetchNextYearIfDecember(year, month);
  const monthIncome = getMonthIncome(
    transactions,
    year,
    month,
    recurringItems
  );
  const fixedItemsTotal = getFixedEstimatedTotal(monthlyFixedItems, ratesToPrimary, recurringItems);
  const amortizedTotal = getAmortizedExpenseForMonth(transactions, year, month);
  const fixedEstimatedTotal = fixedItemsTotal + amortizedTotal;
  const monthlyDisposable = getMonthlyDisposable(
    monthIncome,
    fixedEstimatedTotal,
    savingTarget
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
    settings.weekendWeight,
    nationalHolidays
  );
  const todaySuggestedBudget = getTodaySuggestedBudget(
    remainingDisposable,
    weighted.weightedSum,
    weighted.todayWeight
  );
  return {
    monthlyIncome: monthIncome,
    fixedEstimatedTotal,
    amortizedTotal,
    savingTarget: Math.max(0, savingTarget),
    monthlyDisposable,
    dailyExpenseSoFar,
    remainingDisposable,
    remainingDays: weighted.remainingDays,
    weekendCount: weighted.weekendCount,
    weekdayCount: weighted.weekdayCount,
    todaySuggestedBudget,
  };
}
