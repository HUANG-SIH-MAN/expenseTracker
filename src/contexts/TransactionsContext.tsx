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
  getStoredAccounts,
  getCreditCardAutoPayRules,
  getCashTopUpRules,
  addTransaction as addTransactionStorage,
  deleteTransaction as deleteTransactionStorage,
  updateTransaction as updateTransactionStorage,
  addTransactionsAtomically,
} from '../utils/storage';
import {
  checkLowBalanceNotifications,
  rescheduleAutopayWarningNotifications,
} from '../utils/notifications';

interface RefreshTransactionsResult {
  autopayCreatedCount: number;
}

interface LatestAutopaySyncEvent {
  eventId: number;
  createdCount: number;
}

interface TransactionsContextValue {
  transactions: Transaction[];
  /** 首次從 DB 載入完畢後為 true，用於避免在空資料狀態下提早觸發依賴計算 */
  isTransactionsReady: boolean;
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
  const [isTransactionsReady, setIsTransactionsReady] = useState(false);
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
    setIsTransactionsReady(true);
    // 檢查低餘額並重新排程自動繳款預警（非阻塞）
    getStoredAccounts().then(async (accounts) => {
      await checkLowBalanceNotifications(accounts, next);
      const rules = await getCreditCardAutoPayRules();
      await rescheduleAutopayWarningNotifications(rules, accounts, next);
    }).catch(() => { /* 通知失敗不影響主流程 */ });
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

  /** 若交易有動到 cash top-up 目標帳戶，立刻以該交易日期補一次 */
  const syncCashTopUpIfNeeded = useCallback(async (
    affectedAccountIds: (string | undefined)[],
    triggerDate?: string,
  ) => {
    const rules = await getCashTopUpRules();
    const activeRules = rules.filter((r) => r.isEnabled);
    const affected = new Set(affectedAccountIds.filter(Boolean));
    const hasMatch = activeRules.some((r) => affected.has(r.targetAccountId));
    if (!hasMatch) return;
    await syncCashTopUpToTransactions(triggerDate);
  }, []);

  const addTransaction = useCallback(async (t: Transaction) => {
    await addTransactionStorage(t);
    await syncCashTopUpIfNeeded([t.accountId, t.toAccountId], t.date);
    return runRefreshFlow();
  }, [runRefreshFlow, syncCashTopUpIfNeeded]);

  const addTransactions = useCallback(async (txs: Transaction[]) => {
    await addTransactionsAtomically(txs);
    const ids = txs.flatMap((t) => [t.accountId, t.toAccountId]);
    const date = txs[0]?.date;
    await syncCashTopUpIfNeeded(ids, date);
    return runRefreshFlow();
  }, [runRefreshFlow, syncCashTopUpIfNeeded]);

  const deleteTransaction = useCallback(async (id: string) => {
    const tx = transactions.find((t) => t.id === id);
    await deleteTransactionStorage(id);
    await syncCashTopUpIfNeeded([tx?.accountId, tx?.toAccountId], tx?.date);
    return runRefreshFlow();
  }, [runRefreshFlow, syncCashTopUpIfNeeded, transactions]);

  const updateTransaction = useCallback(async (t: Transaction) => {
    await updateTransactionStorage(t);
    await syncCashTopUpIfNeeded([t.accountId, t.toAccountId], t.date);
    return runRefreshFlow();
  }, [runRefreshFlow, syncCashTopUpIfNeeded]);

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
    isTransactionsReady,
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
