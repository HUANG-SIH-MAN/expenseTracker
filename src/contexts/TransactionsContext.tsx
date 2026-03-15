/**
 * 交易列表狀態與持久化
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Transaction } from '../types';
import {
  getStoredTransactions,
  saveTransactions,
  addTransaction as addTransactionStorage,
  deleteTransaction as deleteTransactionStorage,
  updateTransaction as updateTransactionStorage,
} from '../utils/storage';

interface TransactionsContextValue {
  transactions: Transaction[];
  addTransaction: (t: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (t: Transaction) => Promise<void>;
  getTransactionsByDate: (date: string) => Transaction[];
  getTransactionById: (id: string) => Transaction | undefined;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function TransactionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    getStoredTransactions().then(setTransactions);
  }, []);

  const addTransaction = useCallback(async (t: Transaction) => {
    await addTransactionStorage(t);
    setTransactions((prev) => [...prev, t]);
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    await deleteTransactionStorage(id);
    setTransactions((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const updateTransaction = useCallback(async (t: Transaction) => {
    await updateTransactionStorage(t);
    setTransactions((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  }, []);

  const getTransactionById = useCallback(
    (id: string) => transactions.find((t) => t.id === id),
    [transactions]
  );

  const getTransactionsByDate = useCallback(
    (date: string) => transactions.filter((t) => t.date === date),
    [transactions]
  );

  const value: TransactionsContextValue = {
    transactions,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    getTransactionById,
    getTransactionsByDate,
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
