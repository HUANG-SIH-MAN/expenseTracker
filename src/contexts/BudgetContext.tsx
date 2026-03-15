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
import type { BudgetSettings, MonthlyFixedItem } from '../types';
import {
  BUDGET_DEFAULT_WEEKDAY_WEIGHT,
  BUDGET_DEFAULT_WEEKEND_WEIGHT,
} from '../constants';
import {
  getBudgetSettings,
  getMonthlyFixedItems,
  saveBudgetSettings,
  saveMonthlyFixedItems,
} from '../utils/storage';

interface BudgetContextValue {
  monthlyFixedItems: MonthlyFixedItem[];
  budgetSettings: BudgetSettings;
  refreshBudget: () => Promise<void>;
  saveMonthlyFixedItems: (items: MonthlyFixedItem[]) => Promise<void>;
  saveBudgetSettings: (settings: BudgetSettings) => Promise<void>;
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
      fixedExpenseCategoryKeys: [],
    });

  const refreshBudget = useCallback(async () => {
    const [items, settings] = await Promise.all([
      getMonthlyFixedItems(),
      getBudgetSettings(),
    ]);
    setMonthlyFixedItems(items);
    setBudgetSettingsState(settings);
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

  const value: BudgetContextValue = {
    monthlyFixedItems,
    budgetSettings,
    refreshBudget,
    saveMonthlyFixedItems: saveFixed,
    saveBudgetSettings: saveSettings,
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
