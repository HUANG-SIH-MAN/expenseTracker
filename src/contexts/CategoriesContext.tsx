/**
 * 類別列表狀態與持久化（支出/收入類別，含圖示）
 * 未儲存時使用預設類別
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CategoryItem, StoredCategories, TransactionType } from '../types';
import { getStoredCategories, saveCategories } from '../utils/storage';
import {
  DEFAULT_EXPENSE_CATEGORIES_LIST,
  DEFAULT_INCOME_CATEGORIES_LIST,
} from '../constants';

export type CategoriesUpdater =
  | StoredCategories
  | ((prev: StoredCategories) => StoredCategories);

interface CategoriesContextValue {
  expenseCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  getCategoryLabel: (type: TransactionType, key: string) => string;
  getCategoryIcon: (type: TransactionType, key: string) => string;
  refreshCategories: () => Promise<void>;
  updateCategories: (data: CategoriesUpdater) => void;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [storedCategories, setStoredCategories] = useState<StoredCategories>(() => ({
    expense: [...DEFAULT_EXPENSE_CATEGORIES_LIST],
    income: [...DEFAULT_INCOME_CATEGORIES_LIST],
  }));

  const expenseCategories = storedCategories.expense;
  const incomeCategories = storedCategories.income;

  const refreshCategories = useCallback(async () => {
    const data = await getStoredCategories();
    if (data) {
      setStoredCategories(data);
    } else {
      setStoredCategories({
        expense: [...DEFAULT_EXPENSE_CATEGORIES_LIST],
        income: [...DEFAULT_INCOME_CATEGORIES_LIST],
      });
    }
  }, []);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  /** 拖曳排序會連續觸發儲存；並行 SQLite 交易易鎖表失敗後 refresh 還原畫面，故序列化寫入。 */
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  const persistCategories = useCallback(
    (snap: StoredCategories) => {
      persistQueueRef.current = persistQueueRef.current
        .catch(() => {
          /* 前一筆拒絕時仍接續序列，避免之後無法再寫入 */
        })
        .then(async () => {
          try {
            await saveCategories(snap);
          } catch {
            await refreshCategories();
          }
        });
    },
    [refreshCategories],
  );

  const updateCategories = useCallback(
    (data: CategoriesUpdater) => {
      setStoredCategories((prev) => {
        const next = typeof data === 'function' ? data(prev) : data;
        persistCategories(next);
        return next;
      });
    },
    [persistCategories],
  );

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
