/**
 * 新增單筆收入/支出 Modal
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { TransactionType } from '../types';
import { generateId } from '../utils/id';
import { formatDateShort } from '../utils/date';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';

const EXPENSE_KEYS = Object.keys(DEFAULT_EXPENSE_CATEGORIES);
const INCOME_KEYS = Object.keys(DEFAULT_INCOME_CATEGORIES);

export interface AddTransactionModalProps {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onSubmit: (transaction: {
    id: string;
    type: TransactionType;
    amount: number;
    date: string;
    category: string;
    note?: string;
    createdAt: string;
  }) => void;
}

export default function AddTransactionModal({
  visible,
  selectedDate,
  onClose,
  onSubmit,
}: AddTransactionModalProps): React.JSX.Element {
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
    onSubmit({
      id: generateId(),
      type,
      amount,
      date: selectedDate,
      category,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setAmountStr('');
    setNote('');
    setCategory(type === 'expense' ? EXPENSE_KEYS[0] : INCOME_KEYS[0]);
    onClose();
  };

  const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '')) || 0;
  const canSubmit = amount > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>新增記帳 — {formatDateShort(selectedDate)}</Text>

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories}>
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
                  >
                    {categoryMap[key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
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
    marginBottom: 6,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    marginBottom: 16,
    color: '#1a1a1a',
  },
  categories: {
    marginBottom: 16,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 24,
    color: '#1a1a1a',
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
