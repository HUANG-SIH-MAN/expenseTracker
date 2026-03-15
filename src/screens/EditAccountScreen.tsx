/**
 * 編輯帳本頁：修改帳戶名稱與「目前金額」
 * 儲存時依目前金額與交易紀錄，自動回推並寫入初始金額
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account } from '../types';
import { getStoredAccounts, updateStoredAccounts } from '../utils/storage';
import { useTransactions } from '../contexts/TransactionsContext';
import type { MainStackParamList } from '../navigation/MainStack';
import Ionicons from '@expo/vector-icons/Ionicons';

const TITLE = '編輯帳本';
const LABEL_NAME = '帳戶名稱';
const LABEL_CURRENT_AMOUNT = '目前金額';
const HINT_CURRENT_AMOUNT = '儲存後將自動回推初始金額';
const PLACEHOLDER_NAME = '例如：現金、銀行、悠遊卡';
const PLACEHOLDER_AMOUNT = '0';
const BTN_SAVE = '儲存';
const BACK_ICON_SIZE = 28;
const ALERT_TITLE = '儲存失敗';
const ALERT_MSG = '找不到該帳戶或無法更新，請重試。';

/** 該帳戶來自交易的淨額（收入 - 支出），不含初始金額 */
function computeNetFromTransactions(
  accountId: string,
  transactions: { type: string; amount: number; accountId?: string }[]
): number {
  let net = 0;
  for (const t of transactions) {
    if (t.accountId !== accountId) continue;
    if (t.type === 'income') net += t.amount;
    else net -= t.amount;
  }
  return net;
}

type NavProp = NativeStackNavigationProp<MainStackParamList, 'EditAccount'>;
type EditAccountRoute = RouteProp<MainStackParamList, 'EditAccount'>;

export default function EditAccountScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<EditAccountRoute>();
  const { accountId } = route.params;
  const { transactions } = useTransactions();

  const [name, setName] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getStoredAccounts().then((accounts) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (acc) {
        setName(acc.name);
        const net = computeNetFromTransactions(accountId, transactions);
        const current = acc.initialBalance + net;
        setCurrentAmount(current === 0 ? '' : String(current));
      }
    });
  }, [accountId, transactions]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const amount = currentAmount === '' ? 0 : parseFloat(currentAmount) || 0;
    if (Number.isNaN(amount)) return;

    const netFromTransactions = computeNetFromTransactions(accountId, transactions);
    const newInitialBalance = amount - netFromTransactions;

    setSaving(true);
    try {
      const accounts = await getStoredAccounts();
      const index = accounts.findIndex((a) => a.id === accountId);
      if (index < 0) {
        Alert.alert(ALERT_TITLE, ALERT_MSG);
        setSaving(false);
        return;
      }
      const next = [...accounts];
      next[index] = {
        ...next[index],
        name: trimmedName,
        initialBalance: newInitialBalance,
      };
      await updateStoredAccounts(next);
      navigation.goBack();
    } catch {
      Alert.alert(ALERT_TITLE, ALERT_MSG);
    } finally {
      setSaving(false);
    }
  }, [accountId, name, currentAmount, transactions, navigation]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_NAME}</Text>
          <TextInput
            style={styles.input}
            placeholder={PLACEHOLDER_NAME}
            placeholderTextColor="#9ca3af"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_CURRENT_AMOUNT}</Text>
          <TextInput
            style={styles.input}
            placeholder={PLACEHOLDER_AMOUNT}
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            value={currentAmount}
            onChangeText={(t) => setCurrentAmount(t.replace(/[^0-9.-]/g, ''))}
          />
          <Text style={styles.hint}>{HINT_CURRENT_AMOUNT}</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !name.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? '儲存中…' : BTN_SAVE}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
