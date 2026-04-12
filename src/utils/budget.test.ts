import { describe, expect, it } from "vitest";
import type { BudgetSettings, MonthlyFixedItem, RecurringItem, Transaction } from "../types";
import { getBudgetSummary, getMonthlyDisposable } from "./budget";

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

describe("budget saving target", () => {
  it("savingTarget=0 時，月可支配維持既有邏輯", () => {
    const disposable = getMonthlyDisposable(
      MONTHLY_INCOME_AMOUNT,
      FIXED_ESTIMATED_AMOUNT,
      SAVING_TARGET_ZERO
    );
    expect(disposable).toBe(EXPECTED_DISPOSABLE_WITHOUT_SAVING);
  });

  it("savingTarget>0 時，月可支配/剩餘可支配/每日建議都會下降", () => {
    const withoutSaving = getBudgetSummary(
      TODAY_KEY,
      transactions,
      monthlyFixedItems,
      baseSettings,
      SAVING_TARGET_ZERO,
      {},
      recurringItems
    );
    const withSaving = getBudgetSummary(
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
    expect(withSaving.todaySuggestedBudget).toBeLessThan(withoutSaving.todaySuggestedBudget);
  });

  it("savingTarget 超過可支配時，結果會被夾到 0", () => {
    const summary = getBudgetSummary(
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
    expect(summary.remainingDisposable).toBe(0);
    expect(summary.todaySuggestedBudget).toBe(0);
  });
});
