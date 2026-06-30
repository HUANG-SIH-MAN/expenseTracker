/**
 * 新增帳本頁：輸入帳戶名稱、幣別、初始金額
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  Modal,
  Alert,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, CurrencyCode } from '../types';
import { generateId } from '../utils/id';
import { getStoredAccounts, updateStoredAccounts, getCurrencyOptions } from '../utils/storage';
import type { CurrencyOption } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CalculatorKeypad } from '../components';
import { parseAmountInput } from '../utils/amountExpression';

const TITLE = '新增帳本';
const LABEL_NAME = '帳戶名稱';
const LABEL_CURRENCY = '幣別';
const LABEL_INITIAL_AMOUNT = '初始金額（選填）';
const PLACEHOLDER_NAME = '例如：現金、信用卡';
const BTN_SAVE = '儲存';
const BACK_ICON_SIZE = 28;
const ALERT_TITLE = '儲存失敗';
const ALERT_MSG = '請重試。';
const CALC_HEIGHT = 280;

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
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    getCurrencyOptions().then(setCurrencyOptions);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let amountStr = initialAmountStr;
    const parsed = parseAmountInput(amountStr);
    if (parsed.valid) {
      amountStr = String(parsed.value);
    }

    const initialBalance = amountStr === ''
      ? 0
      : parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
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

  const handleCalcConfirm = useCallback(() => {
    const parsed = parseAmountInput(initialAmountStr);
    if (parsed.valid) {
      setInitialAmountStr(parsed.value === 0 ? '' : String(parsed.value));
    }
    setShowCalc(false);
  }, [initialAmountStr]);

  const canSave = name.trim().length > 0;
  const isAmountPlaceholder = initialAmountStr.trim() === '';
  const amountDisplayText = isAmountPlaceholder ? '點此輸入金額' : initialAmountStr;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: showCalc ? CALC_HEIGHT + 24 : insets.bottom + 40 },
        ]}
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
            onFocus={() => setShowCalc(false)}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_CURRENCY}</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => { setShowCalc(false); setShowCurrencyPicker(true); }}
          >
            <Text style={styles.currencyButtonText}>
              {getCurrencyLabel(currency, currencyOptions)}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_INITIAL_AMOUNT}</Text>
          <TouchableOpacity
            style={[styles.input, styles.amountTouchable, showCalc && styles.amountTouchableFocused]}
            onPress={() => { Keyboard.dismiss(); setShowCalc(true); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.amountText, isAmountPlaceholder && styles.amountPlaceholder]}>
              {amountDisplayText}
            </Text>
            <Ionicons name="calculator-outline" size={18} color="#9ca3af" />
          </TouchableOpacity>
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

      {/* 計算機面板（固定在底部） */}
      {showCalc && (
        <View
          style={[
            styles.calcPanel,
            { height: CALC_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.calcHeader}>
            <Text style={styles.calcExpression} numberOfLines={1}>
              {initialAmountStr === '' ? '0' : initialAmountStr}
            </Text>
            <TouchableOpacity onPress={() => setShowCalc(false)} hitSlop={12}>
              <Ionicons name="chevron-down" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <CalculatorKeypad
            value={initialAmountStr}
            onValueChange={setInitialAmountStr}
            onConfirm={handleCalcConfirm}
          />
        </View>
      )}
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
  scrollContent: { padding: 20 },
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
  amountTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountTouchableFocused: {
    borderColor: '#2563eb',
  },
  amountText: {
    fontSize: 16,
    color: '#1f2937',
    flex: 1,
  },
  amountPlaceholder: {
    color: '#9ca3af',
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
  calcPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  calcExpression: {
    fontSize: 22,
    fontWeight: '500',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
    textAlign: 'right',
  },
});
