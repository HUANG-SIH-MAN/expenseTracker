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
  ScrollView,
  Alert,
  Modal,
  Platform,
  Keyboard,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, CurrencyCode, CurrencyOption } from '../types';
import { getStoredAccounts, updateStoredAccounts, getCurrencyOptions } from '../utils/storage';
import { useTransactions } from '../contexts/TransactionsContext';
import type { MainStackParamList } from '../navigation/MainStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CalculatorKeypad } from '../components';
import { parseAmountInput } from '../utils/amountExpression';

const TITLE = '編輯帳本';
const LABEL_NAME = '帳戶名稱';
const LABEL_CURRENCY = '幣別';
const LABEL_CURRENT_AMOUNT = '目前金額';
const HINT_CURRENT_AMOUNT = '儲存後將自動回推初始金額';
const PLACEHOLDER_NAME = '例如：現金、銀行、悠遊卡';
const BTN_SAVE = '儲存';
const BACK_ICON_SIZE = 28;
const ALERT_TITLE = '儲存失敗';
const ALERT_MSG = '找不到該帳戶或無法更新，請重試。';
const CALC_HEIGHT = 280;

function getCurrencyLabel(currency: string, options: CurrencyOption[]): string {
  const o = options.find((x) => x.code === currency);
  return o?.label ?? currency;
}

/** 該帳戶來自交易的淨額（收入 - 支出 - 轉出 + 轉入），不含初始金額 */
function computeNetFromTransactions(
  accountId: string,
  transactions: {
    type: string;
    amount: number;
    accountId?: string;
    toAccountId?: string;
    transferAmount?: number;
  }[],
): number {
  let net = 0;
  for (const t of transactions) {
    if (t.type === "transfer") {
      if (t.accountId === accountId) net -= t.amount;
      if (t.toAccountId === accountId) net += t.transferAmount ?? 0;
      continue;
    }
    if (t.accountId !== accountId) continue;
    if (t.type === "income") net += t.amount;
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
  const [currency, setCurrency] = useState<CurrencyCode>('TWD');
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [currentAmount, setCurrentAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    getCurrencyOptions().then(setCurrencyOptions);
  }, []);

  useEffect(() => {
    getStoredAccounts().then((accounts: Account[]) => {
      const acc = accounts.find((a: Account) => a.id === accountId);
      if (acc) {
        setName(acc.name);
        setCurrency(acc.currency ?? 'TWD');
        setIsHidden(acc.isHidden === true);
        const net = computeNetFromTransactions(accountId, transactions);
        const current = acc.initialBalance + net;
        setCurrentAmount(current === 0 ? '' : String(current));
      }
    });
  }, [accountId, transactions]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // 若還有未計算的算式，先計算
    let amountStr = currentAmount;
    const parsed = parseAmountInput(amountStr);
    if (parsed.valid) {
      amountStr = String(parsed.value);
    }

    const amount = amountStr === '' ? 0 : parseFloat(amountStr) || 0;
    if (Number.isNaN(amount)) return;

    const netFromTransactions = computeNetFromTransactions(accountId, transactions);
    const newInitialBalance = amount - netFromTransactions;

    setSaving(true);
    try {
      const accounts = await getStoredAccounts();
      const index = accounts.findIndex((a: Account) => a.id === accountId);
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
        currency: currency ?? 'TWD',
        isHidden,
      };
      await updateStoredAccounts(next);
      navigation.goBack();
    } catch {
      Alert.alert(ALERT_TITLE, ALERT_MSG);
    } finally {
      setSaving(false);
    }
  }, [accountId, name, currency, currentAmount, isHidden, transactions, navigation]);

  const handleCalcConfirm = useCallback(() => {
    // 按 OK 時計算算式並關閉計算機
    const parsed = parseAmountInput(currentAmount);
    if (parsed.valid) {
      setCurrentAmount(parsed.value === 0 ? '' : String(parsed.value));
    }
    setShowCalc(false);
  }, [currentAmount]);

  const amountDisplayText = currentAmount.trim() === '' ? '點此輸入金額' : currentAmount;
  const isAmountPlaceholder = currentAmount.trim() === '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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

        <View style={styles.switchRow}>
          <View style={styles.switchLabelWrap}>
            <Text style={styles.switchLabel}>在記帳時隱藏此帳戶</Text>
            <Text style={styles.switchHint}>帳本餘額頁仍會顯示</Text>
          </View>
          <Switch value={isHidden} onValueChange={setIsHidden} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_CURRENT_AMOUNT}</Text>
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
                  {currency === opt.code && (
                    <Text style={styles.modalRowCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>

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
              {currentAmount === '' ? '0' : currentAmount}
            </Text>
            <TouchableOpacity onPress={() => setShowCalc(false)} hitSlop={12}>
              <Ionicons name="chevron-down" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <CalculatorKeypad
            value={currentAmount}
            onValueChange={setCurrentAmount}
            onConfirm={handleCalcConfirm}
          />
        </View>
      )}
    </View>
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
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  switchLabelWrap: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  switchHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
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
  currencyButtonText: {
    fontSize: 16,
    color: '#1f2937',
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
    color: '#1f2937',
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
