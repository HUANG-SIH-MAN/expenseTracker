/**
 * 新增/編輯單筆收入/支出 — 表單 + 底部計算機鍵盤
 */
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TransactionType } from '../types';
import { generateId } from '../utils/id';
import { parseAmountInput } from '../utils/amountExpression';
import { formatDateWithWeekday } from '../utils/date';
import { useTransactions } from '../contexts/TransactionsContext';
import { getStoredAccounts } from '../utils/storage';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';
import { CalculatorKeypad } from '../components';
import type { Account } from '../types';

type RouteProps = NativeStackScreenProps<MainStackParamList, 'AddTransaction'>['route'];

const EXPENSE_KEYS = Object.keys(DEFAULT_EXPENSE_CATEGORIES);
const INCOME_KEYS = Object.keys(DEFAULT_INCOME_CATEGORIES);
/** 鍵盤區佔畫面高度比例（0～1），表單區佔其餘，讓「整頁」都在畫面內 */
const KEYPAD_FLEX_RATIO = 0.32;
const BODY_FLEX_RATIO = 1 - KEYPAD_FLEX_RATIO;
const LABEL_ACCOUNT = '帳戶';
const BACK_LABEL = '返回';

export default function AddTransactionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { selectedDate, transactionId } = route.params;
  const { addTransaction, updateTransaction, getTransactionById } = useTransactions();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [dateKey, setDateKey] = useState(selectedDate);
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState(EXPENSE_KEYS[0]);
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

  const isEditMode = Boolean(transactionId);
  const existing = transactionId ? getTransactionById(transactionId) : undefined;

  useEffect(() => {
    getStoredAccounts().then((list) => {
      const valid = list.filter((a) => a.name.trim() !== '');
      setAccounts(valid);
      if (valid.length > 0 && !transactionId) {
        setAccountId((prev) => prev ?? valid[0].id);
      }
    });
  }, [transactionId]);

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setDateKey(existing.date);
    setAmountStr(String(existing.amount));
    setCategory(existing.category);
    setNote(existing.note ?? '');
    setAccountId(existing.accountId);
  }, [existing?.id]);

  const categoryMap = type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
  const categoryKeys = type === 'expense' ? EXPENSE_KEYS : INCOME_KEYS;

  const handleTypeChange = (t: TransactionType) => {
    setType(t);
    setCategory(t === 'expense' ? EXPENSE_KEYS[0] : INCOME_KEYS[0]);
  };

  const parsed = parseAmountInput(amountStr);
  const amount = parsed.value;
  const canSubmit = parsed.valid && amount > 0;
  const amountError = amountStr.trim() !== '' && !parsed.valid ? parsed.error : undefined;

  const handleSubmit = () => {
    if (!parsed.valid || amount <= 0) return;
    if (isEditMode && existing) {
      updateTransaction({
        ...existing,
        type,
        amount,
        date: dateKey,
        category,
        note: note.trim() || undefined,
        accountId: accountId || undefined,
      });
    } else {
      addTransaction({
        id: generateId(),
        type,
        amount,
        date: dateKey,
        category,
        note: note.trim() || undefined,
        accountId: accountId || undefined,
        createdAt: new Date().toISOString(),
      });
    }
    navigation.goBack();
  };

  const amountDisplay = amountStr.trim() === '' ? '金額' : amountStr;

  return (
    <View style={styles.container}>
      <ScrollView
        style={[styles.bodyScroll, { flex: BODY_FLEX_RATIO }]}
        contentContainerStyle={[
          styles.bodyContent,
          {
            paddingTop: Math.max(12, insets.top),
            paddingBottom: Math.max(8, insets.bottom),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.typeRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backBtnText}>{BACK_LABEL}</Text>
          </TouchableOpacity>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, type === 'expense' && styles.tabActive]}
              onPress={() => handleTypeChange('expense')}
            >
              <Text style={[styles.tabText, type === 'expense' && styles.tabTextActive]}>支出</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, type === 'income' && styles.tabActive]}
              onPress={() => handleTypeChange('income')}
            >
              <Text style={[styles.tabText, type === 'income' && styles.tabTextActive]}>收入</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={styles.saveBtn}
          >
            <Text style={[styles.saveBtnText, !canSubmit && styles.saveBtnTextDisabled]}>儲存</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>日期</Text>
          <Text style={styles.fieldValue}>{formatDateWithWeekday(dateKey)}</Text>
        </View>

        <View style={styles.amountSection}>
          <Text style={[styles.amountDisplay, amountError && styles.amountDisplayError]}>
            {amountDisplay}
          </Text>
          {amountError ? <Text style={styles.amountError}>{amountError}</Text> : null}
        </View>

        <View style={styles.categoryWrap}>
          {categoryKeys.map((key) => {
            const isSelected = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                onPress={() => setCategory(key)}
              >
                <Text
                  style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                  numberOfLines={1}
                >
                  {categoryMap[key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {accounts.length > 0 ? (
          <>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABEL_ACCOUNT}</Text>
            </View>
            <View style={styles.accountWrap}>
              {accounts.map((acc) => {
                const isSelected = accountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>備註（選填）</Text>
        </View>
        <TextInput
          style={styles.noteInput}
          placeholder="可輸入備註"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />
      </ScrollView>

      <View style={[styles.keypadWrap, { flex: KEYPAD_FLEX_RATIO }]}>
        <CalculatorKeypad
          value={amountStr}
          onValueChange={setAmountStr}
          onConfirm={handleSubmit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    maxHeight: '100%',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2%',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 12,
    minWidth: 44,
  },
  backBtnText: {
    fontSize: 17,
    color: '#0a84ff',
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  saveBtnText: {
    fontSize: 17,
    color: '#0a84ff',
    fontWeight: '500',
  },
  saveBtnTextDisabled: {
    color: '#9ca3af',
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#0a84ff',
  },
  tabText: {
    fontSize: 16,
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  bodyScroll: {
    minHeight: 0,
  },
  bodyContent: {
    paddingHorizontal: '5%',
    paddingBottom: '1%',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.2%',
  },
  fieldLabel: {
    fontSize: 15,
    color: '#6b7280',
  },
  fieldValue: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  amountSection: {
    marginBottom: '1.5%',
  },
  amountDisplay: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  amountDisplayError: {
    color: '#dc2626',
  },
  amountError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 2,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: '-1%',
    marginBottom: '1.2%',
    marginTop: '0.3%',
  },
  accountWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: '-1%',
    marginBottom: '1.2%',
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: '2.5%',
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginHorizontal: '1%',
    marginBottom: 4,
  },
  categoryChipSelected: {
    backgroundColor: '#0a84ff',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#374151',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: '2%',
    paddingVertical: 8,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 36,
    maxHeight: 56,
  },
  keypadWrap: {
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
});
