import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Account, CurrencyCode } from '../types';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import AccountsSetupScreen from '../screens/onboarding/AccountsSetupScreen';
import CurrencyScreen from '../screens/onboarding/CurrencyScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  AccountsSetup: undefined;
  Currency: { accounts: Account[] };
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingStack(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 18, fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AccountsSetup"
        component={AccountsSetupScreen}
        options={{ title: '設定帳戶' }}
      />
      <Stack.Screen
        name="Currency"
        component={CurrencyScreen}
        options={{
          title: '主要貨幣',
          headerBackTitle: '上一步',
        }}
      />
    </Stack.Navigator>
  );
}
