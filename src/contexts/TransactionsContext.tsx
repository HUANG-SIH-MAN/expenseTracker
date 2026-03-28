/**
 * 交易列表狀態與持久化
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Transaction } from '../types';
import {
  syncRecurringToTransactions,
  syncCreditCardAutopayToTransactions,
  syncCashTopUpToTransactions,
  getStoredTransactions,
  addTransaction as addTransactionStorage,
  deleteTransaction as deleteTransactionStorage,
  updateTransaction as updateTransactionStorage,
  addTransactionsAtomically,
} from '../utils/storage';

interface RefreshTransactionsResult {
  autopayCreatedCount: number;
}

interface LatestAutopaySyncEvent {
  eventId: number;
  createdCount: number;
}

interface TransactionsContextValue {
  transactions: Transaction[];
  addTransaction: (t: Transaction) => Promise<RefreshTransactionsResult>;
  addTransactions: (txs: Transaction[]) => Promise<RefreshTransactionsResult>;
  deleteTransaction: (id: string) => Promise<RefreshTransactionsResult>;
  updateTransaction: (t: Transaction) => Promise<RefreshTransactionsResult>;
  getTransactionsByDate: (date: string) => Transaction[];
  getTransactionById: (id: string) => Transaction | undefined;
  /** 重新同步固定收支並更新列表（如從設定頁新增固定收支後回首頁） */
  refreshTransactions: () => Promise<RefreshTransactionsResult>;
  latestAutopaySyncEvent: LatestAutopaySyncEvent;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function TransactionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [latestAutopaySyncEvent, setLatestAutopaySyncEvent] = useState<LatestAutopaySyncEvent>({
    eventId: 0,
    createdCount: 0,
  });

  const runRefreshFlow = useCallback(async (): Promise<RefreshTransactionsResult> => {
    await syncRecurringToTransactions();
    const autopayResult = await syncCreditCardAutopayToTransactions();
    await syncCashTopUpToTransactions();
    setLatestAutopaySyncEvent((prev) => {
      if (autopayResult.createdCount <= 0) {
        return {
          ...prev,
          createdCount: 0,
        };
      }
      return {
        eventId: prev.eventId + 1,
        createdCount: autopayResult.createdCount,
      };
    });
    const next = await getStoredTransactions();
    setTransactions(next);
    return { autopayCreatedCount: autopayResult.createdCount };
  }, []);

  useEffect(() => {
    runRefreshFlow();
  }, [runRefreshFlow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        runRefreshFlow();
      }
    });
    return () => subscription.remove();
  }, [runRefreshFlow]);

  const addTransaction = useCallback(async (t: Transaction) => {
    await addTransactionStorage(t);
    return runRefreshFlow();
  }, [runRefreshFlow]);

  const addTransactions = useCallback(async (txs: Transaction[]) => {
    await addTransactionsAtomically(txs);
    return runRefreshFlow();
  }, [runRefreshFlow]);

  const deleteTransaction = useCallback(async (id: string) => {
    await deleteTransactionStorage(id);
    return runRefreshFlow();
  }, [runRefreshFlow]);

  const updateTransaction = useCallback(async (t: Transaction) => {
    await updateTransactionStorage(t);
    return runRefreshFlow();
  }, [runRefreshFlow]);

  const getTransactionById = useCallback(
    (id: string) => transactions.find((t) => t.id === id),
    [transactions]
  );

  const getTransactionsByDate = useCallback(
    (date: string) => transactions.filter((t) => t.date === date),
    [transactions]
  );

  const refreshTransactions = useCallback(async () => runRefreshFlow(), [runRefreshFlow]);

  const value: TransactionsContextValue = {
    transactions,
    addTransaction,
    addTransactions,
    deleteTransaction,
    updateTransaction,
    getTransactionById,
    getTransactionsByDate,
    refreshTransactions,
    latestAutopaySyncEvent,
  };

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions(): TransactionsContextValue {
  const ctx = useContext(TransactionsContext);
  if (ctx == null) {
    throw new Error('useTransactions must be used within TransactionsProvider');
  }
  return ctx;
}
