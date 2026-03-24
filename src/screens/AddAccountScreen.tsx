/**
 * 新增帳本頁：輸入帳戶名稱、幣別、初始金額
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
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, CurrencyCode } from '../types';
import { generateId } from '../utils/id';
import { getStoredAccounts, updateStoredAccounts, getCurrencyOptions } from '../utils/storage';
import type { CurrencyOption } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';
import { KEYBOARD_SIGNED_DECIMAL } from '../constants';
import Ionicons from '@expo/vector-icons/Ionicons';

const TITLE = '新增帳本';
const LABEL_NAME = '帳戶名稱';
const LABEL_CURRENCY = '幣別';
const LABEL_INITIAL_AMOUNT = '初始金額（選填）';
const PLACEHOLDER_NAME = '例如：現金、外幣錢包、永豐 (台幣)';
const PLACEHOLDER_AMOUNT = '0';
const BTN_SAVE = '儲存';
const BACK_ICON_SIZE = 28;
const ALERT_TITLE = '儲存失敗';
const ALERT_MSG = '請重試。';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'AddAccount'>;

function getCurrencyLabel(currency: string, options: CurrencyOption[]): string {
  const o = options.find((x) => x.code === currency);
  return o?.label ?? currency;
}

export default function AddAccountScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TWD');
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [initialAmountStr, setInitialAmountStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  useEffect(() => {
    getCurrencyOptions().then(setCurrencyOptions);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const initialBalance = initialAmountStr === ''
      ? 0
      : parseFloat(initialAmountStr.replace(/[^0-9.-]/g, '')) || 0;
    if (Number.isNaN(initialBalance)) return;

    setSaving(true);
    try {
      const accounts = await getStoredAccounts();
      const newAccount: Account = {
        id: generateId(),
        name: trimmedName,
        initialBalance,
        currency: currency ?? 'TWD',
      };
      await updateStoredAccounts([...accounts, newAccount]);
      navigation.goBack();
    } catch {
      Alert.alert(ALERT_TITLE, ALERT_MSG);
    } finally {
      setSaving(false);
    }
  }, [name, currency, initialAmountStr, navigation]);

  const canSave = name.trim().length > 0;

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
        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <Text style={[styles.saveBtnText, (!canSave || saving) && styles.saveBtnTextDisabled]}>
            {saving ? '儲存中…' : BTN_SAVE}
          </Text>
        </TouchableOpacity>
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
          <Text style={styles.label}>{LABEL_CURRENCY}</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowCurrencyPicker(true)}
          >
            <Text style={styles.currencyButtonText}>
              {getCurrencyLabel(currency, currencyOptions)}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_INITIAL_AMOUNT}</Text>
          <TextInput
            style={styles.input}
            placeholder={PLACEHOLDER_AMOUNT}
            placeholderTextColor="#9ca3af"
            keyboardType={KEYBOARD_SIGNED_DECIMAL}
            value={initialAmountStr}
            onChangeText={(t) => setInitialAmountStr(t.replace(/[^0-9.-]/g, ''))}
          />
        </View>
      </ScrollView>

      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{LABEL_CURRENCY}</Text>
            {currencyOptions.map((opt) => (
              <TouchableOpacity
                key={opt.code}
                style={styles.modalRow}
                onPress={() => {
                  setCurrency(opt.code);
                  setShowCurrencyPicker(false);
                }}
              >
                <Text style={styles.modalRowText}>{opt.label}</Text>
                {currency === opt.code && <Text style={styles.modalRowCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  backBtn: { paddingVertical: 8, paddingRight: 16 },
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937', flex: 1 },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  saveBtnText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  saveBtnTextDisabled: { color: '#9ca3af' },
  saveBtnDisabled: {},
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
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
  currencyButtonText: { fontSize: 16, color: '#1f2937' },
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
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#1f2937' },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalRowText: { fontSize: 16, color: '#374151' },
  modalRowCheck: { fontSize: 16, color: '#2563eb' },
});
