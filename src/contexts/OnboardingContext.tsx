/**
 * 導覽狀態：是否已完成、完成時寫入儲存並更新狀態
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Account, CurrencyCode } from '../types';
import { getOnboardingData, setOnboardingComplete } from '../utils/storage';

interface OnboardingContextValue {
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  completeOnboarding: (accounts: Account[], primaryCurrency: CurrencyCode) => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOnboardingData().then((data) => {
      if (!cancelled) {
        setHasCompletedOnboarding(data?.hasCompletedOnboarding === true);
      }
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(
    async (accounts: Account[], primaryCurrency: CurrencyCode) => {
      await setOnboardingComplete({ accounts, primaryCurrency });
      setHasCompletedOnboarding(true);
    },
    []
  );

  const value: OnboardingContextValue = {
    isLoading,
    hasCompletedOnboarding,
    completeOnboarding,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (ctx == null) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
