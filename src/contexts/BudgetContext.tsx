/**
 * 預算：月固定/預估支出列表與預算設定狀態
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { BudgetSettings, MonthlyFixedItem, MonthlySavingTarget } from '../types';
import {
  BUDGET_DEFAULT_WEEKDAY_WEIGHT,
  BUDGET_DEFAULT_WEEKEND_WEIGHT,
} from '../constants';
import {
  getBudgetSettings,
  getMonthlySavingTargets,
  getMonthlyFixedItems,
  saveBudgetSettings,
  saveMonthlySavingTarget as saveMonthlySavingTargetToStorage,
  saveMonthlyFixedItems,
} from '../utils/storage';

interface BudgetContextValue {
  monthlyFixedItems: MonthlyFixedItem[];
  budgetSettings: BudgetSettings;
  monthlySavingTargets: MonthlySavingTarget[];
  refreshBudget: () => Promise<void>;
  saveMonthlyFixedItems: (items: MonthlyFixedItem[]) => Promise<void>;
  saveBudgetSettings: (settings: BudgetSettings) => Promise<void>;
  getMonthlySavingTargetAmount: (yearMonth: string) => number;
  saveMonthlySavingTarget: (yearMonth: string, amount: number) => Promise<void>;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [monthlyFixedItems, setMonthlyFixedItems] = useState<
    MonthlyFixedItem[]
  >([]);
  const [budgetSettings, setBudgetSettingsState] =
    useState<BudgetSettings>({
      defaultMonthlyIncome: 0,
      weekdayWeight: BUDGET_DEFAULT_WEEKDAY_WEIGHT,
      weekendWeight: BUDGET_DEFAULT_WEEKEND_WEIGHT,
    });
  const [monthlySavingTargets, setMonthlySavingTargets] = useState<
    MonthlySavingTarget[]
  >([]);

  const refreshBudget = useCallback(async () => {
    const [items, settings, savingTargets] = await Promise.all([
      getMonthlyFixedItems(),
      getBudgetSettings(),
      getMonthlySavingTargets(),
    ]);
    setMonthlyFixedItems(items);
    setBudgetSettingsState(settings);
    setMonthlySavingTargets(savingTargets);
  }, []);

  useEffect(() => {
    refreshBudget();
  }, [refreshBudget]);

  const saveFixed = useCallback(
    async (items: MonthlyFixedItem[]) => {
      await saveMonthlyFixedItems(items);
      setMonthlyFixedItems(items);
    },
    []
  );

  const saveSettings = useCallback(
    async (settings: BudgetSettings) => {
      await saveBudgetSettings(settings);
      setBudgetSettingsState(settings);
    },
    []
  );

  const getMonthlySavingTargetAmount = useCallback(
    (yearMonth: string): number => {
      const matched = monthlySavingTargets.find((item) => item.yearMonth === yearMonth);
      return matched?.amount ?? 0;
    },
    [monthlySavingTargets]
  );

  const saveMonthlySavingTarget = useCallback(
    async (yearMonth: string, amount: number) => {
      await saveMonthlySavingTargetToStorage(yearMonth, amount);
      setMonthlySavingTargets((previous) => {
        const next = previous.filter((item) => item.yearMonth !== yearMonth);
        next.push({ yearMonth, amount: Math.max(0, Number(amount) || 0) });
        next.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
        return next;
      });
    },
    []
  );

  const value: BudgetContextValue = {
    monthlyFixedItems,
    budgetSettings,
    monthlySavingTargets,
    refreshBudget,
    saveMonthlyFixedItems: saveFixed,
    saveBudgetSettings: saveSettings,
    getMonthlySavingTargetAmount,
    saveMonthlySavingTarget,
  };

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (ctx == null) {
    throw new Error('useBudget must be used within BudgetProvider');
  }
  return ctx;
}
