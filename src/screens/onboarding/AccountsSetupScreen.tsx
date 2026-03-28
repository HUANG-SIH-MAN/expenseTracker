import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, CurrencyCode, CurrencyOption } from '../../types';
import { generateId } from '../../utils/id';
import { getCurrencyOptions } from '../../utils/storage';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';
import { KEYBOARD_SIGNED_DECIMAL } from '../../constants';

const LABEL_ACCOUNTS = '設定您的帳戶';
const LABEL_ACCOUNTS_DESC = '新增每個帳戶的名稱與目前金額，至少需要一個帳戶。';
const PLACEHOLDER_NAME = '例如：現金、銀行、悠遊卡';
const PLACEHOLDER_AMOUNT = '0';
const BUTTON_ADD = '新增帳戶';
const BUTTON_NEXT = '下一步';
const HINT_AT_LEAST_ONE = '請至少新增一個帳戶';
const LABEL_CURRENCY = '幣別';

function getCurrencyLabel(currency: string, options: CurrencyOption[]): string {
  const o = options.find((x) => x.code === currency);
  return o?.label ?? currency;
}

type NavProp = NativeStackNavigationProp<OnboardingStackParamList, 'AccountsSetup'>;

export default function AccountsSetupScreen(): React.JSX.Element {
  const navigation = useNavigation<NavProp>();
  const [accounts, setAccounts] = useState<Account[]>([
    { id: generateId(), name: '現金', initialBalance: 0, currency: 'TWD' },
  ]);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [currencyPickerAccountId, setCurrencyPickerAccountId] = useState<string | null>(null);

  useEffect(() => {
    getCurrencyOptions().then(setCurrencyOptions);
  }, []);

  const updateAccount = (id: string, field: 'name' | 'initialBalance' | 'currency', value: string | number) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id
          ? field === 'name'
            ? { ...a, name: value as string }
            : field === 'initialBalance'
              ? { ...a, initialBalance: Number(value) || 0 }
              : { ...a, currency: value as CurrencyCode }
          : a
      )
    );
    if (field === 'initialBalance' && typeof value === 'string') {
      setAmountInputs((prev) => ({ ...prev, [id]: value }));
    }
    if (field === 'currency') setCurrencyPickerAccountId(null);
  };

  const addAccount = () => {
    const id = generateId();
    setAccounts((prev) => [...prev, { id, name: '', initialBalance: 0, currency: 'TWD' }]);
    setAmountInputs((prev) => ({ ...prev, [id]: '' }));
  };

  const removeAccount = (id: string) => {
    if (accounts.length <= 1) return;
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setAmountInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const canProceed = accounts.some((a) => a.name.trim() !== '');
  const handleNext = () => {
    const valid = accounts.filter((a) => a.name.trim() !== '').map((a) => ({
      id: a.id,
      name: a.name.trim(),
      initialBalance: a.initialBalance,
      currency: a.currency ?? 'TWD',
    }));
    if (valid.length > 0) {
      navigation.navigate('Currency', { accounts: valid });
    }
  };

  const accountForCurrencyPicker = currencyPickerAccountId
    ? accounts.find((a) => a.id === currencyPickerAccountId)
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{LABEL_ACCOUNTS}</Text>
        <Text style={styles.desc}>{LABEL_ACCOUNTS_DESC}</Text>

        {accounts.map((acc) => (
          <View key={acc.id} style={styles.card}>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.inputName]}
                placeholder={PLACEHOLDER_NAME}
                placeholderTextColor="#999"
                value={acc.name}
                onChangeText={(t) => updateAccount(acc.id, 'name', t)}
              />
              {accounts.length > 1 && (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeAccount(acc.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.removeBtnText}>刪除</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.fieldLabel}>{LABEL_CURRENCY}</Text>
            <TouchableOpacity
              style={styles.currencyButton}
              onPress={() => setCurrencyPickerAccountId(acc.id)}
            >
              <Text style={styles.currencyButtonText}>
                {getCurrencyLabel(acc.currency ?? 'TWD', currencyOptions)}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.input, styles.inputAmount]}
              placeholder={PLACEHOLDER_AMOUNT}
              placeholderTextColor="#999"
              keyboardType={KEYBOARD_SIGNED_DECIMAL}
              value={amountInputs[acc.id] ?? (acc.initialBalance ? String(acc.initialBalance) : '')}
              onChangeText={(t) => {
                const num = t.replace(/[^0-9.-]/g, '');
                setAmountInputs((prev) => ({ ...prev, [acc.id]: t }));
                updateAccount(acc.id, 'initialBalance', num === '' ? 0 : parseFloat(num) || 0);
              }}
            />
            <Text style={styles.amountLabel}>目前金額</Text>
          </View>
        ))}

        <Modal
          visible={accountForCurrencyPicker != null}
          transparent
          animationType="fade"
          onRequestClose={() => setCurrencyPickerAccountId(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setCurrencyPickerAccountId(null)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{LABEL_CURRENCY}</Text>
              {currencyOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.code}
                  style={styles.modalRow}
                  onPress={() => accountForCurrencyPicker && updateAccount(accountForCurrencyPicker.id, 'currency', opt.code)}
                >
                  <Text style={styles.modalRowText}>{opt.label}</Text>
                  {accountForCurrencyPicker?.currency === opt.code && (
                    <Text style={styles.modalRowCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        <TouchableOpacity style={styles.addButton} onPress={addAccount}>
          <Text style={styles.addButtonText}>{BUTTON_ADD}</Text>
        </TouchableOpacity>

        {!canProceed && (
          <Text style={styles.hint}>{HINT_AT_LEAST_ONE}</Text>
        )}

        <TouchableOpacity
          style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>{BUTTON_NEXT}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  desc: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputName: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 10,
    marginBottom: 4,
  },
  currencyButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  currencyButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  inputAmount: {
    marginTop: 10,
    marginBottom: 4,
  },
  amountLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  removeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  removeBtnText: {
    color: '#dc2626',
    fontSize: 14,
  },
  addButton: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 8,
  },
  nextButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1a1a1a',
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalRowText: {
    fontSize: 16,
    color: '#374151',
  },
  modalRowCheck: {
    fontSize: 16,
    color: '#2563eb',
  },
});
