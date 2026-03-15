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
import type { TransactionType } from '../types';

export type MainStackParamList = {
  Home: undefined;
  AddTransaction: { selectedDate: string; transactionId?: string };
  LedgerBalance: undefined;
  Statistics: undefined;
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
        name="LedgerBalance"
        component={LedgerBalanceScreen}
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
    </Stack.Navigator>
  );
}
