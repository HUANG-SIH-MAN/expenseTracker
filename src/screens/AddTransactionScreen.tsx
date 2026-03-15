/**
 * 新增單筆收入/支出 — 表單 + 底部計算機鍵盤（類參考介面）
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TransactionType } from '../types';
import { generateId } from '../utils/id';
import { parseAmountInput } from '../utils/amountExpression';
import { formatDateWithWeekday } from '../utils/date';
import { useTransactions } from '../contexts/TransactionsContext';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';
import { CalculatorKeypad } from '../components';

type RouteProps = NativeStackScreenProps<MainStackParamList, 'AddTransaction'>['route'];

const EXPENSE_KEYS = Object.keys(DEFAULT_EXPENSE_CATEGORIES);
const INCOME_KEYS = Object.keys(DEFAULT_INCOME_CATEGORIES);
const HEADER_HEIGHT_PERCENT = 0.08;
const KEYPAD_HEIGHT_PERCENT = 0.42;

export default function AddTransactionScreen(): React.JSX.Element {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { selectedDate } = route.params;
  const { addTransaction } = useTransactions();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState(EXPENSE_KEYS[0]);
  const [note, setNote] = useState('');

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
    addTransaction({
      id: generateId(),
      type,
      amount,
      date: selectedDate,
      category,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    navigation.goBack();
  };

  const amountDisplay = amountStr.trim() === '' ? '金額' : amountStr;
  const { height: windowHeight } = useWindowDimensions();
  const headerHeight = windowHeight * HEADER_HEIGHT_PERCENT;
  const keypadHeight = windowHeight * KEYPAD_HEIGHT_PERCENT;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { height: headerHeight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBtnText}>✕</Text>
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
          style={[styles.headerBtn, styles.saveBtn]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={[styles.headerBtnText, !canSubmit && styles.saveBtnTextDisabled]}>儲存</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>日期</Text>
          <Text style={styles.fieldValue}>{formatDateWithWeekday(selectedDate)}</Text>
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
      </View>

      <View style={[styles.keypadWrap, { height: keypadHeight }]}>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerBtn: {
    minWidth: 44,
    alignItems: 'flex-start',
  },
  headerBtnText: {
    fontSize: 17,
    color: '#0a84ff',
  },
  saveBtn: {
    alignItems: 'flex-end',
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
  body: {
    flex: 1,
    paddingHorizontal: '5%',
    paddingTop: '2%',
    paddingBottom: '4%',
    justifyContent: 'flex-start',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5%',
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
    marginBottom: '2%',
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
    marginBottom: '2%',
    marginTop: '0.5%',
  },
  categoryChip: {
    paddingVertical: '1.2%',
    paddingHorizontal: '3%',
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginHorizontal: '1%',
    marginBottom: '1%',
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
    paddingVertical: '1%',
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: '12%',
  },
  keypadWrap: {
    marginTop: '3%',
  },
});
