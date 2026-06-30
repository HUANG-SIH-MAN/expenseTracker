import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { OnboardingProvider, useOnboarding } from './src/contexts/OnboardingContext';
import { TransactionsProvider } from './src/contexts/TransactionsContext';
import { CategoriesProvider } from './src/contexts/CategoriesContext';
import { BudgetProvider } from './src/contexts/BudgetContext';
import { InvestmentProvider } from './src/contexts/InvestmentContext';
import OnboardingStack from './src/navigation/OnboardingStack';
import MainStack from './src/navigation/MainStack';
import { fetchRatesToPrimary } from './src/utils/exchangeRate';
import { saveExchangeRates } from './src/utils/storage';
import { ENABLE_INVESTMENTS } from './src/config/features';

function RootNavigator(): React.JSX.Element {
  const { isLoading, hasCompletedOnboarding } = useOnboarding();

  React.useEffect(() => {
    fetchRatesToPrimary('TWD').then((rates) => {
      if (rates) saveExchangeRates(rates);
    });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>載入中…</Text>
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingStack />;
  }

  return (
    <TransactionsProvider>
      <CategoriesProvider>
        <BudgetProvider>
          {ENABLE_INVESTMENTS ? (
            <InvestmentProvider>
              <MainStack />
            </InvestmentProvider>
          ) : (
            <MainStack />
          )}
        </BudgetProvider>
      </CategoriesProvider>
    </TransactionsProvider>
  );
}

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <OnboardingProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </OnboardingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
});
