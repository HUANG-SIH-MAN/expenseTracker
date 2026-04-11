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
import SelectTransactionCategoryScreen from '../screens/SelectTransactionCategoryScreen';
import SelectTransactionAccountScreen from '../screens/SelectTransactionAccountScreen';
import SelectBudgetLinkScreen from '../screens/SelectBudgetLinkScreen';
import CreditCardAutoPaySettingsScreen from '../screens/CreditCardAutoPaySettingsScreen';
import CreditCardAutoPayEditScreen from '../screens/CreditCardAutoPayEditScreen';
import CashTopUpSettingsScreen from '../screens/CashTopUpSettingsScreen';
import CashTopUpEditScreen from '../screens/CashTopUpEditScreen';
import TransferTemplateSettingsScreen from '../screens/TransferTemplateSettingsScreen';
import TransferTemplateEditScreen from '../screens/TransferTemplateEditScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import StockDetailScreen from '../screens/StockDetailScreen';
import AddStockTransactionScreen from '../screens/AddStockTransactionScreen';
import ImportStockScreen from '../screens/ImportStockScreen';
import StockWatchlistSettingsScreen from '../screens/StockWatchlistSettingsScreen';
import ETFExposureScreen from '../screens/ETFExposureScreen';
import InvestmentSettingsScreen from '../screens/InvestmentSettingsScreen';
import type { TransactionType, StockTransaction } from '../types';

export type MainStackParamList = {
  Home: undefined;
  AddTransaction: {
    selectedDate: string;
    transactionId?: string;
    /** 由選擇類別頁返回時帶入，套用後會清除 */
    pickedCategoryKey?: string;
    /** 由選擇帳戶頁返回時帶入，套用後會清除 */
    pickedAccountId?: string;
    /** 由連接預算頁返回時帶入，null 表示清除，套用後會清除 */
    pickedMonthlyFixedItemId?: string | null;
    pickedAnnualBudgetEntryId?: string | null;
  };
  AddTransfer: { selectedDate?: string; transactionId?: string };
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
  CreditCardAutoPaySettings: undefined;
  CreditCardAutoPayEdit: { ruleId?: string };
  CashTopUpSettings: undefined;
  CashTopUpEdit: { ruleId?: string };
  TransferTemplateSettings: undefined;
  TransferTemplateEdit: { templateId?: string };
  BudgetSettings: undefined;
  BudgetFixedEdit: { itemId?: string; linkedRecurringItemId?: string };
  ImportExport: undefined;
  SelectTransactionCategory: {
    transactionType: 'expense' | 'income';
    selectedKey: string;
    returnDate: string;
    returnTransactionId?: string;
    returnToRouteKey?: string;
  };
  SelectTransactionAccount: {
    selectedAccountId?: string;
    returnDate: string;
    returnTransactionId?: string;
    returnToRouteKey?: string;
  };
  Portfolio: undefined;
  ETFExposure: undefined;
  InvestmentSettings: undefined;
  StockDetail: { ticker: string };
  AddStockTransaction: { ticker?: string; transaction?: StockTransaction };
  ImportStock: undefined;
  StockWatchlistSettings: undefined;
  SelectBudgetLink: {
    transactionType: string;
    dateKey: string;
    currentMonthlyFixedItemId?: string;
    currentAnnualBudgetEntryId?: string;
    returnDate: string;
    returnTransactionId?: string;
    transactionAmount?: number;
    transactionNote?: string;
    transactionCategory?: string;
    transactionAccountId?: string;
  };
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
        name="SelectTransactionCategory"
        component={SelectTransactionCategoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SelectTransactionAccount"
        component={SelectTransactionAccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SelectBudgetLink"
        component={SelectBudgetLinkScreen}
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
        name="CreditCardAutoPaySettings"
        component={CreditCardAutoPaySettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreditCardAutoPayEdit"
        component={CreditCardAutoPayEditScreen}
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
      <Stack.Screen
        name="CashTopUpSettings"
        component={CashTopUpSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CashTopUpEdit"
        component={CashTopUpEditScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferTemplateSettings"
        component={TransferTemplateSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TransferTemplateEdit"
        component={TransferTemplateEditScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ETFExposure"
        component={ETFExposureScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InvestmentSettings"
        component={InvestmentSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddStockTransaction"
        component={AddStockTransactionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ImportStock"
        component={ImportStockScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StockWatchlistSettings"
        component={StockWatchlistSettingsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
