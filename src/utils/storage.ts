/**
 * 使用 AsyncStorage 讀寫導覽、帳戶與交易
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Account, CurrencyCode, OnboardingData, Transaction } from '../types';
import { STORAGE_KEYS } from '../constants';

const DEFAULT_PRIMARY_CURRENCY: CurrencyCode = 'TWD';

export async function getOnboardingData(): Promise<OnboardingData | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingData;
    return parsed;
  } catch {
    return null;
  }
}

export async function setOnboardingComplete(data: {
  accounts: Account[];
  primaryCurrency: CurrencyCode;
}): Promise<void> {
  const payload: OnboardingData = {
    hasCompletedOnboarding: true,
    accounts: data.accounts,
    primaryCurrency: data.primaryCurrency,
  };
  await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(payload));
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  const data = await getOnboardingData();
  return data?.hasCompletedOnboarding === true;
}

export async function getStoredAccounts(): Promise<Account[]> {
  const data = await getOnboardingData();
  return data?.accounts ?? [];
}

/** 更新已儲存的帳戶列表（用於編輯帳本後寫回） */
export async function updateStoredAccounts(accounts: Account[]): Promise<void> {
  const data = await getOnboardingData();
  if (!data?.hasCompletedOnboarding) return;
  await setOnboardingComplete({
    accounts,
    primaryCurrency: data.primaryCurrency,
  });
}

export async function getStoredPrimaryCurrency(): Promise<CurrencyCode> {
  const data = await getOnboardingData();
  return data?.primaryCurrency ?? DEFAULT_PRIMARY_CURRENCY;
}

/** 更新主要貨幣（設定頁編輯用） */
export async function updateStoredPrimaryCurrency(currency: CurrencyCode): Promise<void> {
  const data = await getOnboardingData();
  if (!data?.hasCompletedOnboarding) return;
  await setOnboardingComplete({
    accounts: data.accounts,
    primaryCurrency: currency,
  });
}

// --- 交易 ---

export async function getStoredTransactions(): Promise<Transaction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Transaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
}

export async function addTransaction(transaction: Transaction): Promise<void> {
  const list = await getStoredTransactions();
  list.push(transaction);
  await saveTransactions(list);
}

export async function deleteTransaction(id: string): Promise<void> {
  const list = await getStoredTransactions();
  const next = list.filter((t) => t.id !== id);
  await saveTransactions(next);
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const list = await getStoredTransactions();
  const index = list.findIndex((t) => t.id === transaction.id);
  if (index < 0) return;
  const next = [...list];
  next[index] = transaction;
  await saveTransactions(next);
}
