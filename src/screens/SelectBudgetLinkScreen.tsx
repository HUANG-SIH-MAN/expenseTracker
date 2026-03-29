/**
 * 記帳表單用：選擇要連結的預算項目（每月固定 或 年度預算）
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/MainStack';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getAnnualBudgetEntries, saveAnnualBudgetEntries } from '../utils/storage';
import { generateId } from '../utils/id';
import type { AnnualBudgetEntry, TransactionType } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SelectBudgetLink'>;

const BACK_ICON_SIZE = 28;
const CHECK_SIZE = 22;

export default function SelectBudgetLinkScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<Props['route']>();
  const {
    transactionType,
    dateKey,
    currentMonthlyFixedItemId,
    currentAnnualBudgetEntryId,
    returnDate,
    returnTransactionId,
  } = route.params;

  const { monthlyFixedItems } = useBudget();
  const { getCategoryLabel, expenseCategories, incomeCategories } = useCategories();

  const [annualEntries, setAnnualEntries] = useState<
    Pick<AnnualBudgetEntry, 'id' | 'month' | 'categoryKey' | 'label' | 'estimatedAmount'>[]
  >([]);

  const [year, month] = dateKey.split('-').map(Number);

  // 快速新增年度項目的 state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAmountStr, setNewAmountStr] = useState('');
  const categories = transactionType === 'income' ? incomeCategories : expenseCategories;
  const [newCategoryKey, setNewCategoryKey] = useState<string>(categories[0]?.key ?? '');

  useEffect(() => {
    getAnnualBudgetEntries(year).then((list) => {
      setAnnualEntries(
        list
          .filter((e) => e.month === month && e.type === (transactionType as TransactionType))
          .map((e) => ({
            id: e.id,
            month: e.month,
            categoryKey: e.categoryKey,
            label: e.label,
            estimatedAmount: e.estimatedAmount,
          }))
      );
    });
  }, [year, month, transactionType]);

  const pick = (monthlyId: string | undefined, annualId: string | undefined) => {
    navigation.navigate({
      name: 'AddTransaction',
      pop: true,
      merge: true,
      params: {
        selectedDate: returnDate,
        transactionId: returnTransactionId,
        pickedMonthlyFixedItemId: monthlyId ?? null,
        pickedAnnualBudgetEntryId: annualId ?? null,
      },
    });
  };

  const openNewForm = () => {
    setNewLabel('');
    setNewAmountStr('');
    setNewCategoryKey(categories[0]?.key ?? '');
    setShowNewForm(true);
  };

  const handleCreateAndLink = useCallback(async () => {
    const amount = Number(newAmountStr);
    if (!newCategoryKey || !Number.isFinite(amount) || amount <= 0) return;

    const existing = await getAnnualBudgetEntries(year);
    const maxOrder = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.sortOrder), 0);
    const newEntry: AnnualBudgetEntry = {
      id: generateId(),
      year,
      month,
      type: transactionType as TransactionType,
      categoryKey: newCategoryKey,
      label: newLabel.trim() || undefined,
      estimatedAmount: amount,
      sortOrder: maxOrder + 1,
    };
    await saveAnnualBudgetEntries(year, [...existing, newEntry]);
    pick(undefined, newEntry.id);
  }, [year, month, transactionType, newCategoryKey, newLabel, newAmountStr]);

  const hasMonthly = transactionType === 'expense' && monthlyFixedItems.length > 0;
  const hasAnnual = annualEntries.length > 0;
  const noneSelected = currentMonthlyFixedItemId == null && currentAnnualBudgetEntryId == null;

  const canCreate = newCategoryKey !== '' && Number(newAmountStr) > 0;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
          </TouchableOpacity>
          <Text style={styles.title}>連接預算項目</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={[styles.row, noneSelected && styles.rowSelected]}
            onPress={() => pick(undefined, undefined)}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowLabel, noneSelected && styles.rowLabelSelected]}>不連結</Text>
            {noneSelected ? (
              <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
            ) : (
              <View style={styles.checkPlaceholder} />
            )}
          </TouchableOpacity>

          {hasMonthly ? (
            <>
              <Text style={styles.sectionHeader}>每月固定收支</Text>
              {monthlyFixedItems.map((item) => {
                const isSelected = currentMonthlyFixedItemId === item.id;
                const amountLabel =
                  item.currency && item.currency !== 'TWD' && item.originalAmount != null
                    ? `${item.originalAmount} ${item.currency} ≈ NT$${Math.round(item.estimatedAmount).toLocaleString()}`
                    : `NT$${item.estimatedAmount.toLocaleString()}`;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => pick(item.id, undefined)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowContent}>
                      <Text
                        style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.rowSub}>預估 {amountLabel}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          {/* 年度固定收支區塊 */}
          <Text style={styles.sectionHeader}>年度固定收支</Text>

          {hasAnnual
            ? annualEntries.map((e) => {
                const isSelected = currentAnnualBudgetEntryId === e.id;
                const displayName = e.label
                  ? `${e.month}月 ${e.label}（${getCategoryLabel(transactionType as TransactionType, e.categoryKey)}）`
                  : `${e.month}月 ${getCategoryLabel(transactionType as TransactionType, e.categoryKey)}`;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => pick(undefined, e.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowContent}>
                      <Text
                        style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      <Text style={styles.rowSub}>計劃 NT${e.estimatedAmount.toLocaleString()}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </TouchableOpacity>
                );
              })
            : null}

          {/* 快速新增年度項目 */}
          {!showNewForm ? (
            <TouchableOpacity style={styles.addNewBtn} onPress={openNewForm} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
              <Text style={styles.addNewBtnText}>新增年度預算項目</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.newForm}>
              <Text style={styles.newFormTitle}>新增年度預算項目</Text>

              <Text style={styles.newFormLabel}>類別</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.categoryChips}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.chip, newCategoryKey === c.key && styles.chipSelected]}
                      onPress={() => setNewCategoryKey(c.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, newCategoryKey === c.key && styles.chipTextSelected]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.newFormLabel}>名稱（選填）</Text>
              <TextInput
                style={styles.input}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder="例：年終獎金 / 所得稅"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.newFormLabel}>金額</Text>
              <TextInput
                style={styles.input}
                value={newAmountStr}
                onChangeText={setNewAmountStr}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />

              <View style={styles.newFormActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowNewForm(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
                  onPress={handleCreateAndLink}
                  disabled={!canCreate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.createBtnText}>建立並連結</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!hasMonthly && !hasAnnual && !showNewForm ? (
            <Text style={styles.empty}>點上方按鈕新增年度預算項目後即可連結</Text>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerRightSpacer: {
    width: BACK_ICON_SIZE + 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowSelected: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowLabel: {
    fontSize: 16,
    color: '#374151',
  },
  rowLabelSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  checkPlaceholder: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 24,
  },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    backgroundColor: '#f0f9ff',
  },
  addNewBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  newForm: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginTop: 4,
  },
  newFormTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 14,
  },
  newFormLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  categoryScroll: {
    marginBottom: 14,
  },
  categoryChips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    marginBottom: 14,
  },
  newFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  createBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
