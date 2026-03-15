import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import { formatDateShort } from '../utils/date';

export type MainStackParamList = {
  Home: undefined;
  AddTransaction: { selectedDate: string };
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
        options={({ route }) => ({
          title: `新增記帳 — ${formatDateShort(route.params.selectedDate)}`,
          headerBackTitle: '返回',
        })}
      />
    </Stack.Navigator>
  );
}
