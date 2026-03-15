/**
 * 新增單筆收入/支出 Modal — 表單 + 底部計算機鍵盤
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  useWindowDimensions,
} from 'react-native';
import type { TransactionType } from '../types';
import { generateId } from '../utils/id';
import { formatDateWithWeekday } from '../utils/date';
import { parseAmountInput } from '../utils/amountExpression';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';
import { CalculatorKeypad } from './CalculatorKeypad';

const EXPENSE_KEYS = Object.keys(DEFAULT_EXPENSE_CATEGORIES);
const INCOME_KEYS = Object.keys(DEFAULT_INCOME_CATEGORIES);
const KEYPAD_HEIGHT_PERCENT = 0.42;

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

  const parsed = parseAmountInput(amountStr);
  const amount = parsed.value;
  const canSubmit = parsed.valid && amount > 0;
  const amountError = amountStr.trim() !== '' && !parsed.valid ? parsed.error : undefined;

  const handleSubmit = () => {
    if (!parsed.valid || amount <= 0) return;
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

  const amountDisplay = amountStr.trim() === '' ? '金額' : amountStr;
  const { height: windowHeight } = useWindowDimensions();
  const keypadHeight = windowHeight * KEYPAD_HEIGHT_PERCENT;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
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
              <Text style={[styles.headerBtnText, !canSubmit && styles.saveBtnTextDisabled]}>
                儲存
              </Text>
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
      </View>
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
    height: '92%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
