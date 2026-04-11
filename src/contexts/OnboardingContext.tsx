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
  /** 重新讀取導覽狀態（清除資料後呼叫以回到導覽畫面） */
  refreshOnboardingState: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadOnboarding() {
      try {
        const data = await getOnboardingData();
        if (!cancelled) {
          setHasCompletedOnboarding(data?.hasCompletedOnboarding === true);
        }
      } catch {
        // 發生讀取錯誤時，保守回退到尚未完成導覽，避免卡在 loading
        if (!cancelled) {
          setHasCompletedOnboarding(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadOnboarding();
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

  const refreshOnboardingState = useCallback(async () => {
    try {
      const data = await getOnboardingData();
      setHasCompletedOnboarding(data?.hasCompletedOnboarding === true);
    } catch {
      setHasCompletedOnboarding(false);
    }
  }, []);

  const value: OnboardingContextValue = {
    isLoading,
    hasCompletedOnboarding,
    completeOnboarding,
    refreshOnboardingState,
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
