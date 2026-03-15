import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import LedgerBalanceScreen from '../screens/LedgerBalanceScreen';
import EditAccountScreen from '../screens/EditAccountScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PrimaryCurrencyScreen from '../screens/PrimaryCurrencyScreen';
import CategorySettingsScreen from '../screens/CategorySettingsScreen';
import RecurringSettingsScreen from '../screens/RecurringSettingsScreen';
import RecurringEditScreen from '../screens/RecurringEditScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import CategoryExpensesScreen from '../screens/CategoryExpensesScreen';
import BudgetSettingsScreen from '../screens/BudgetSettingsScreen';
import BudgetFixedEditScreen from '../screens/BudgetFixedEditScreen';
import ImportExportScreen from '../screens/ImportExportScreen';
import AddTransferScreen from '../screens/AddTransferScreen';
import ExchangeRatesScreen from '../screens/ExchangeRatesScreen';
import AddAccountScreen from '../screens/AddAccountScreen';
import CurrencySettingsScreen from '../screens/CurrencySettingsScreen';
import type { TransactionType } from '../types';

export type MainStackParamList = {
  Home: undefined;
  AddTransaction: { selectedDate: string; transactionId?: string };
  AddTransfer: { selectedDate?: string };
  LedgerBalance: undefined;
  AddAccount: undefined;
  Statistics: undefined;
  ExchangeRates: undefined;
  CurrencySettings: undefined;
  CategoryExpenses: {
    categoryKey: string;
    transactionType: TransactionType;
    period: 'month' | 'year';
    year: number;
    month?: number;
  };
  EditAccount: { accountId: string };
  Settings: undefined;
  PrimaryCurrency: undefined;
  CategorySettings: undefined;
  RecurringSettings: undefined;
  RecurringEdit: { recurringId?: string };
  BudgetSettings: undefined;
  BudgetFixedEdit: { itemId?: string };
  ImportExport: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 18, fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddTransfer"
        component={AddTransferScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LedgerBalance"
        component={LedgerBalanceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddAccount"
        component={AddAccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ExchangeRates"
        component={ExchangeRatesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CurrencySettings"
        component={CurrencySettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CategoryExpenses"
        component={CategoryExpensesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditAccount"
        component={EditAccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PrimaryCurrency"
        component={PrimaryCurrencyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CategorySettings"
        component={CategorySettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RecurringSettings"
        component={RecurringSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RecurringEdit"
        component={RecurringEditScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BudgetSettings"
        component={BudgetSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BudgetFixedEdit"
        component={BudgetFixedEditScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ImportExport"
        component={ImportExportScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
