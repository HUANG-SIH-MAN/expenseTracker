import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BudgetSettings, MonthlyFixedItem, RecurringItem, Transaction } from "../types";
import { getBudgetSummary, getMonthlyDisposable, getRemainingWeightedDays } from "./budget";

// getCachedTaiwanHolidays 回傳空陣列（預設），各測試可依需要 override
vi.mock("./taiwanHolidays", () => ({
  getCachedTaiwanHolidays: vi.fn().mockResolvedValue([]),
  prefetchNextYearIfDecember: vi.fn().mockResolvedValue(undefined),
}));

import { getCachedTaiwanHolidays } from "./taiwanHolidays";
const mockGetCachedTaiwanHolidays = vi.mocked(getCachedTaiwanHolidays);

const TODAY_KEY = "2026-04-10";
const MONTHLY_INCOME_AMOUNT = 100000;
const FIXED_ESTIMATED_AMOUNT = 30000;
const DAILY_EXPENSE_AMOUNT = 5000;
const WEEKDAY_WEIGHT = 1;
const WEEKEND_WEIGHT = 1.5;
const SAVING_TARGET_ZERO = 0;
const SAVING_TARGET_NORMAL = 10000;
const SAVING_TARGET_TOO_LARGE = 999999;
const EXPECTED_DISPOSABLE_WITHOUT_SAVING = MONTHLY_INCOME_AMOUNT - FIXED_ESTIMATED_AMOUNT;
const EXPECTED_DISPOSABLE_WITH_SAVING =
  MONTHLY_INCOME_AMOUNT - FIXED_ESTIMATED_AMOUNT - SAVING_TARGET_NORMAL;
const EXPECTED_REMAINING_WITHOUT_SAVING =
  EXPECTED_DISPOSABLE_WITHOUT_SAVING - DAILY_EXPENSE_AMOUNT;
const EXPECTED_REMAINING_WITH_SAVING =
  EXPECTED_DISPOSABLE_WITH_SAVING - DAILY_EXPENSE_AMOUNT;

const baseSettings: BudgetSettings = {
  defaultMonthlyIncome: 0,
  weekdayWeight: WEEKDAY_WEIGHT,
  weekendWeight: WEEKEND_WEIGHT,
};

const recurringItems: RecurringItem[] = [
  {
    id: "rec-income-1",
    type: "income",
    amount: MONTHLY_INCOME_AMOUNT,
    category: "salary",
    repeat: "monthly",
    day: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const monthlyFixedItems: MonthlyFixedItem[] = [
  {
    id: "fixed-1",
    label: "房租",
    estimatedAmount: FIXED_ESTIMATED_AMOUNT,
    sortOrder: 0,
  },
];

const transactions: Transaction[] = [
  {
    id: "tx-expense-1",
    type: "expense",
    amount: DAILY_EXPENSE_AMOUNT,
    date: "2026-04-08",
    category: "food",
    createdAt: "2026-04-08T00:00:00.000Z",
  },
];

beforeEach(() => {
  mockGetCachedTaiwanHolidays.mockResolvedValue([]);
});

describe("budget saving target", () => {
  it("savingTarget=0 時，月可支配維持既有邏輯", () => {
    const disposable = getMonthlyDisposable(
      MONTHLY_INCOME_AMOUNT,
      FIXED_ESTIMATED_AMOUNT,
      SAVING_TARGET_ZERO
    );
    expect(disposable).toBe(EXPECTED_DISPOSABLE_WITHOUT_SAVING);
  });

  it("savingTarget>0 時，月可支配/剩餘可支配/每日建議都會下降", async () => {
    const withoutSaving = await getBudgetSummary(
      TODAY_KEY,
      transactions,
      monthlyFixedItems,
      baseSettings,
      SAVING_TARGET_ZERO,
      {},
      recurringItems
    );
    const withSaving = await getBudgetSummary(
      TODAY_KEY,
      transactions,
      monthlyFixedItems,
      baseSettings,
      SAVING_TARGET_NORMAL,
      {},
      recurringItems
    );
    expect(withoutSaving).not.toBeNull();
    expect(withSaving).not.toBeNull();
    if (!withoutSaving || !withSaving) return;
    expect(withoutSaving.monthlyDisposable).toBe(EXPECTED_DISPOSABLE_WITHOUT_SAVING);
    expect(withSaving.monthlyDisposable).toBe(EXPECTED_DISPOSABLE_WITH_SAVING);
    expect(withoutSaving.remainingDisposable).toBe(EXPECTED_REMAINING_WITHOUT_SAVING);
    expect(withSaving.remainingDisposable).toBe(EXPECTED_REMAINING_WITH_SAVING);
    expect(withSaving.overspentAmount).toBe(0);
    expect(withSaving.projectedSavingAfterExpenses).toBe(SAVING_TARGET_NORMAL);
    expect(withSaving.todaySuggestedBudget).toBeLessThan(withoutSaving.todaySuggestedBudget);
  });

  it("savingTarget 超過可支配時，結果會被夾到 0", async () => {
    const summary = await getBudgetSummary(
      TODAY_KEY,
      transactions,
      monthlyFixedItems,
      baseSettings,
      SAVING_TARGET_TOO_LARGE,
      {},
      recurringItems
    );
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.monthlyDisposable).toBe(0);
    expect(summary.remainingDisposable).toBe(-DAILY_EXPENSE_AMOUNT);
    expect(summary.overspentAmount).toBe(DAILY_EXPENSE_AMOUNT);
    expect(summary.projectedSavingAfterExpenses).toBe(
      Math.max(0, SAVING_TARGET_TOO_LARGE - DAILY_EXPENSE_AMOUNT)
    );
    expect(summary.todaySuggestedBudget).toBe(0);
  });

  it("超支時，會回傳透支金額與扣除超支後的可存金額", async () => {
    const overspendingTransactions: Transaction[] = [
      {
        id: "tx-expense-overspend",
        type: "expense",
        amount: 69000,
        date: "2026-04-08",
        category: "shopping",
        createdAt: "2026-04-08T00:00:00.000Z",
      },
    ];
    const summary = await getBudgetSummary(
      TODAY_KEY,
      overspendingTransactions,
      monthlyFixedItems,
      baseSettings,
      3000,
      {},
      recurringItems
    );
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.remainingDisposable).toBe(-2000);
    expect(summary.overspentAmount).toBe(2000);
    expect(summary.projectedSavingAfterExpenses).toBe(1000);
  });
});

describe("國定假日權重", () => {
  // 2026-04-10（今天，星期五）至 2026-04-30
  // 若 2026-04-13（一）設為國定假日，應使用假日權重

  it("國定假日（平日）應使用假日權重，加權總和會增加", () => {
    // 純六日判斷
    const withoutHoliday = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      []
    );
    // 2026-04-13（週一）設為國定假日
    const withHoliday = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      ["2026-04-13"]
    );
    // 增加一個平日→假日，加權差 = WEEKEND_WEIGHT - WEEKDAY_WEIGHT = 0.5
    expect(withHoliday.weightedSum).toBeCloseTo(
      withoutHoliday.weightedSum + (WEEKEND_WEIGHT - WEEKDAY_WEIGHT)
    );
    // weekendCount 應增加 1，weekdayCount 應減少 1
    expect(withHoliday.weekendCount).toBe(withoutHoliday.weekendCount + 1);
    expect(withHoliday.weekdayCount).toBe(withoutHoliday.weekdayCount - 1);
  });

  it("國定假日若落在六日，不重複計算（加權不變）", () => {
    // 2026-04-11（六）本來就是假日，加入國定假日清單不應改變結果
    const withoutExtra = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      []
    );
    const withWeekendHoliday = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      ["2026-04-11"] // 週六已是假日
    );
    expect(withWeekendHoliday.weightedSum).toBeCloseTo(withoutExtra.weightedSum);
    expect(withWeekendHoliday.weekendCount).toBe(withoutExtra.weekendCount);
  });

  it("今天是國定假日時，todayWeight 應使用假日權重", () => {
    // TODAY_KEY = 2026-04-10（週五，平日）
    const withTodayHoliday = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      [TODAY_KEY]
    );
    expect(withTodayHoliday.todayWeight).toBe(WEEKEND_WEIGHT);
  });

  it("API 失敗（空陣列）時，fallback 為純六日判斷，結果與無假日相同", async () => {
    mockGetCachedTaiwanHolidays.mockResolvedValue([]);
    const summary = await getBudgetSummary(
      TODAY_KEY,
      transactions,
      monthlyFixedItems,
      baseSettings,
      SAVING_TARGET_ZERO,
      {},
      recurringItems
    );
    const fallbackWeighted = getRemainingWeightedDays(
      TODAY_KEY,
      WEEKDAY_WEIGHT,
      WEEKEND_WEIGHT,
      []
    );
    expect(summary).not.toBeNull();
    expect(summary!.weekendCount).toBe(fallbackWeighted.weekendCount);
    expect(summary!.weekdayCount).toBe(fallbackWeighted.weekdayCount);
  });
});
