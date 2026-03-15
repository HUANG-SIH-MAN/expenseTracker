/**
 * 新增單筆收入/支出 — 獨立畫面（非彈窗）
 * 類別使用 flexWrap 換行，避免破版
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TransactionType } from '../types';
import { generateId } from '../utils/id';
import { useTransactions } from '../contexts/TransactionsContext';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';

type RouteProps = NativeStackScreenProps<MainStackParamList, 'AddTransaction'>['route'];

const EXPENSE_KEYS = Object.keys(DEFAULT_EXPENSE_CATEGORIES);
const INCOME_KEYS = Object.keys(DEFAULT_INCOME_CATEGORIES);

const CHIP_GAP = 8;

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

  const handleSubmit = () => {
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
    if (amount <= 0) return;
    const transaction = {
      id: generateId(),
      type,
      amount,
      date: selectedDate,
      category,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    addTransaction(transaction);
    navigation.goBack();
  };

  const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
  const canSubmit = amount > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
            onPress={() => handleTypeChange('expense')}
          >
            <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>
              支出
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, type === 'income' && styles.typeBtnActive]}
            onPress={() => handleTypeChange('income')}
          >
            <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>
              收入
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>金額</Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0"
          placeholderTextColor="#9ca3af"
          keyboardType="decimal-pad"
          value={amountStr}
          onChangeText={setAmountStr}
        />

        <Text style={styles.label}>類別</Text>
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

        <Text style={styles.label}>備註（選填）</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="備註"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.submitBtnText}>儲存</Text>
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
    paddingTop: 16,
    paddingBottom: 32,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  typeBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  typeBtnText: {
    fontSize: 15,
    color: '#6b7280',
  },
  typeBtnTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    marginBottom: 20,
    color: '#1a1a1a',
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -CHIP_GAP / 2,
    marginBottom: 20,
  },
  categoryChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginHorizontal: CHIP_GAP / 2,
    marginBottom: CHIP_GAP,
  },
  categoryChipSelected: {
    backgroundColor: '#2563eb',
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
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 28,
    color: '#1a1a1a',
    minHeight: 48,
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
