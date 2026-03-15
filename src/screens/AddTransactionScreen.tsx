/**
 * 新增/編輯單筆收入/支出 — 表單 + 底部計算機鍵盤
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Account, AnnualBudgetEntry, TransactionType } from '../types';
import { generateId } from '../utils/id';
import { parseAmountInput } from '../utils/amountExpression';
import { formatDateWithWeekday } from '../utils/date';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredAccounts, addRecurringSkip, getAnnualBudgetEntries } from '../utils/storage';
import type { MainStackParamList } from '../navigation/MainStack';
import { CalculatorKeypad } from '../components';
import Ionicons from '@expo/vector-icons/Ionicons';

type RouteProps = NativeStackScreenProps<MainStackParamList, 'AddTransaction'>['route'];

/** 鍵盤區佔畫面高度比例（0～1），表單區佔其餘，讓「整頁」都在畫面內 */
const KEYPAD_FLEX_RATIO = 0.32;
const BODY_FLEX_RATIO = 1 - KEYPAD_FLEX_RATIO;
const LABEL_ACCOUNT = '帳戶';
const LABEL_ANNUAL_BUDGET = '對應年度預算項目（選填）';
const BTN_SELECT_ANNUAL = '選擇年度預算項目';
const ANNUAL_BUDGET_NONE = '不指定';
const ANNUAL_PICKER_TITLE = '選擇對應的年度預算項目';
const BACK_ICON_SIZE = 28;

export default function AddTransactionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { selectedDate, transactionId } = route.params;
  const { addTransaction, updateTransaction, getTransactionById } = useTransactions();
  const { expenseCategories, incomeCategories, getCategoryLabel } = useCategories();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [dateKey, setDateKey] = useState(selectedDate);
  const [amountStr, setAmountStr] = useState('');
  const categoryList = type === 'expense' ? expenseCategories : incomeCategories;
  const categoryKeys = categoryList.map((c) => c.key);
  const categoryMap = categoryList.reduce<Record<string, string>>((acc, c) => {
    acc[c.key] = c.label;
    return acc;
  }, {});
  const [category, setCategory] = useState(categoryKeys[0] ?? '');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [annualBudgetEntryId, setAnnualBudgetEntryId] = useState<string | undefined>(undefined);
  const [annualEntries, setAnnualEntries] = useState<
    Pick<AnnualBudgetEntry, 'id' | 'month' | 'categoryKey' | 'label' | 'estimatedAmount'>[]
  >([]);
  const [showAnnualPicker, setShowAnnualPicker] = useState(false);

  const isEditMode = Boolean(transactionId);
  const existing = transactionId ? getTransactionById(transactionId) : undefined;

  useEffect(() => {
    const keys = type === 'expense'
      ? expenseCategories.map((c) => c.key)
      : incomeCategories.map((c) => c.key);
    const first = keys[0];
    if (first) setCategory((prev) => (keys.includes(prev) ? prev : first));
  }, [type, expenseCategories, incomeCategories]);

  useEffect(() => {
    getStoredAccounts().then((list: Account[]) => {
      const valid = list.filter((a: Account) => a.name.trim() !== '');
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
    const list = existing.type === 'expense' ? expenseCategories : incomeCategories;
    const keys = list.map((c) => c.key);
    setCategory(keys.includes(existing.category) ? existing.category : keys[0] ?? existing.category);
    setNote(existing.note ?? '');
    setAccountId(existing.accountId);
    setAnnualBudgetEntryId(existing.annualBudgetEntryId);
  }, [existing?.id]);

  const dateYear = useMemo(() => {
    const [y] = dateKey.split('-').map(Number);
    return y;
  }, [dateKey]);
  const dateMonth = useMemo(() => {
    const [, m] = dateKey.split('-').map(Number);
    return m;
  }, [dateKey]);

  useEffect(() => {
    getAnnualBudgetEntries(dateYear).then((list: AnnualBudgetEntry[]) => {
      const filtered = list
        .filter((e: AnnualBudgetEntry) => e.month === dateMonth && e.type === type)
        .map((e: AnnualBudgetEntry) => ({
          id: e.id,
          month: e.month,
          categoryKey: e.categoryKey,
          label: e.label,
          estimatedAmount: e.estimatedAmount,
        }));
      setAnnualEntries(filtered);
    });
  }, [dateYear, dateMonth, type]);

  useEffect(() => {
    if (annualBudgetEntryId == null || annualEntries.length === 0) return;
    const inList = annualEntries.some((e) => e.id === annualBudgetEntryId);
    if (!inList) setAnnualBudgetEntryId(undefined);
  }, [annualEntries, annualBudgetEntryId]);

  const handleTypeChange = (t: TransactionType) => {
    setType(t);
    const list = t === 'expense' ? expenseCategories : incomeCategories;
    const first = list[0]?.key;
    if (first) setCategory(first);
  };

  const parsed = parseAmountInput(amountStr);
  const amount = parsed.value;
  const canSubmit = parsed.valid && amount > 0;
  const amountError = amountStr.trim() !== '' && !parsed.valid ? parsed.error : undefined;

  const handleSubmit = async () => {
    if (!parsed.valid || amount <= 0) return;
    if (isEditMode && existing) {
      if (existing.recurringId) {
        await addRecurringSkip(existing.recurringId, existing.date);
      }
      await updateTransaction({
        ...existing,
        type,
        amount,
        date: dateKey,
        category,
        note: note.trim() || undefined,
        accountId: accountId || undefined,
        recurringId: undefined,
        annualBudgetEntryId,
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
        annualBudgetEntryId,
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
            <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
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

        {annualEntries.length > 0 ? (
          <>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{LABEL_ANNUAL_BUDGET}</Text>
            </View>
            <TouchableOpacity
              style={styles.annualBudgetButton}
              onPress={() => setShowAnnualPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.annualBudgetButtonText} numberOfLines={1}>
                {annualBudgetEntryId
                  ? (() => {
                      const sel = annualEntries.find((e) => e.id === annualBudgetEntryId);
                      if (!sel) return BTN_SELECT_ANNUAL;
                      const name = sel.label
                        ? `${sel.month}月 ${sel.label}（${getCategoryLabel(type, sel.categoryKey)}）`
                        : `${sel.month}月 ${getCategoryLabel(type, sel.categoryKey)}`;
                      return `已選：${name}`;
                    })()
                  : BTN_SELECT_ANNUAL}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <Modal
              visible={showAnnualPicker}
              transparent
              animationType="fade"
              onRequestClose={() => setShowAnnualPicker(false)}
            >
              <TouchableOpacity
                style={styles.annualPickerOverlay}
                activeOpacity={1}
                onPress={() => setShowAnnualPicker(false)}
              >
                <View style={styles.annualPickerContent}>
                  <Text style={styles.annualPickerTitle}>{ANNUAL_PICKER_TITLE}</Text>
                  <ScrollView style={styles.annualPickerList}>
                    <TouchableOpacity
                      style={[
                        styles.annualPickerRow,
                        annualBudgetEntryId == null && styles.annualPickerRowSelected,
                      ]}
                      onPress={() => {
                        setAnnualBudgetEntryId(undefined);
                        setShowAnnualPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.annualPickerRowText,
                          annualBudgetEntryId == null && styles.annualPickerRowTextSelected,
                        ]}
                      >
                        {ANNUAL_BUDGET_NONE}
                      </Text>
                    </TouchableOpacity>
                    {annualEntries.map((e) => {
                      const displayName = e.label
                        ? `${e.month}月 ${e.label}（${getCategoryLabel(type, e.categoryKey)}）`
                        : `${e.month}月 ${getCategoryLabel(type, e.categoryKey)}`;
                      const isSelected = annualBudgetEntryId === e.id;
                      return (
                        <TouchableOpacity
                          key={e.id}
                          style={[
                            styles.annualPickerRow,
                            isSelected && styles.annualPickerRowSelected,
                          ]}
                          onPress={() => {
                            setAnnualBudgetEntryId(e.id);
                            setShowAnnualPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.annualPickerRowText,
                              isSelected && styles.annualPickerRowTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {displayName} 計劃 {e.estimatedAmount}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.annualPickerClose}
                    onPress={() => setShowAnnualPicker(false)}
                  >
                    <Text style={styles.annualPickerCloseText}>關閉</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
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
  annualBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: '1.2%',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
  },
  annualBudgetButtonText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  annualPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  annualPickerContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  annualPickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  annualPickerList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  annualPickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  annualPickerRowSelected: {
    backgroundColor: '#eff6ff',
  },
  annualPickerRowText: {
    fontSize: 15,
    color: '#374151',
  },
  annualPickerRowTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  annualPickerClose: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  annualPickerCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
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
