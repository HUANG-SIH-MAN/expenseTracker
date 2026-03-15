import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { APP_NAME } from '../../constants';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

const WELCOME_TITLE = '歡迎使用';
const WELCOME_DESC = '接下來請設定您的帳戶與目前金額，以及主要使用的貨幣。';
const BUTTON_START = '開始設定';

type NavProp = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.welcome}>{WELCOME_TITLE}</Text>
      <Text style={styles.desc}>{WELCOME_DESC}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('AccountsSetup')}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{BUTTON_START}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  welcome: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  desc: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
