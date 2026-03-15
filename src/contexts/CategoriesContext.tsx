/**
 * 類別列表狀態與持久化（支出/收入類別，含圖示）
 * 未儲存時使用預設類別
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CategoryItem, StoredCategories, TransactionType } from '../types';
import { getStoredCategories, saveCategories } from '../utils/storage';
import {
  DEFAULT_EXPENSE_CATEGORIES_LIST,
  DEFAULT_INCOME_CATEGORIES_LIST,
} from '../constants';

interface CategoriesContextValue {
  expenseCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  getCategoryLabel: (type: TransactionType, key: string) => string;
  getCategoryIcon: (type: TransactionType, key: string) => string;
  refreshCategories: () => Promise<void>;
  updateCategories: (data: StoredCategories) => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

function getDefaultCategories(): StoredCategories {
  return {
    expense: [...DEFAULT_EXPENSE_CATEGORIES_LIST],
    income: [...DEFAULT_INCOME_CATEGORIES_LIST],
  };
}

export function CategoriesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [expenseCategories, setExpenseCategories] = useState<CategoryItem[]>(
    DEFAULT_EXPENSE_CATEGORIES_LIST
  );
  const [incomeCategories, setIncomeCategories] = useState<CategoryItem[]>(
    DEFAULT_INCOME_CATEGORIES_LIST
  );

  const refreshCategories = useCallback(async () => {
    const data = await getStoredCategories();
    if (data) {
      setExpenseCategories(data.expense);
      setIncomeCategories(data.income);
    } else {
      setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES_LIST);
      setIncomeCategories(DEFAULT_INCOME_CATEGORIES_LIST);
    }
  }, []);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const updateCategories = useCallback(async (data: StoredCategories) => {
    setExpenseCategories(data.expense);
    setIncomeCategories(data.income);
    saveCategories(data).catch(() => {
      refreshCategories();
    });
  }, [refreshCategories]);

  const getCategoryLabel = useCallback(
    (type: TransactionType, key: string): string => {
      const list = type === 'expense' ? expenseCategories : incomeCategories;
      const item = list.find((c) => c.key === key);
      return item?.label ?? key;
    },
    [expenseCategories, incomeCategories]
  );

  const getCategoryIcon = useCallback(
    (type: TransactionType, key: string): string => {
      const list = type === 'expense' ? expenseCategories : incomeCategories;
      const item = list.find((c) => c.key === key);
      return item?.icon ?? '📌';
    },
    [expenseCategories, incomeCategories]
  );

  const value: CategoriesContextValue = {
    expenseCategories,
    incomeCategories,
    getCategoryLabel,
    getCategoryIcon,
    refreshCategories,
    updateCategories,
  };

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories(): CategoriesContextValue {
  const ctx = useContext(CategoriesContext);
  if (!ctx) {
    throw new Error('useCategories must be used within CategoriesProvider');
  }
  return ctx;
}
