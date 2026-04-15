/**
 * 月預算 Tab：每月固定/預估支出列表 + 預算設定（收入來源說明、權重）
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { MonthlyFixedItem, RecurringItem } from '../types';
import { useBudget } from '../contexts/BudgetContext';
import { useTransactions } from '../contexts/TransactionsContext';
import { getTodayKey } from '../utils/date';
import { getStoredRecurring } from '../utils/storage';
import { getAmortizedItemsForMonth } from '../utils/budget';

const SECTION_FIXED = '每月固定/預估支出';
const SECTION_SETTINGS = '預算設定';
const BTN_ADD = '新增固定支出';
const LABEL_INCOME_SOURCE = '收入來源（自動計算）';
const LABEL_INCOME_SOURCE_HINT =
  '月收入會使用「每月固定收入」+「其他收入記帳（不含年度預算與固定收支自動帶入）」';
const LABEL_WEEKDAY_WEIGHT = '平日權重';
const LABEL_WEEKEND_WEIGHT = '假日權重';
const LABEL_MONTHLY_SAVING_TARGET = '本月預計存款';
const BTN_SAVE_SETTINGS = '儲存設定';
const EMPTY_HINT = '尚無固定支出項目，可點下方按鈕新增';
const DEFAULT_WEEKDAY_WEIGHT = 1;
const DEFAULT_WEEKEND_WEIGHT = 1.5;
const MONTHLY_SAVING_TARGET_PLACEHOLDER = '0';
const BOTTOM_BAR_HEIGHT = 56;
const SCROLL_BOTTOM_GAP = 24;

interface MonthlyBudgetTabProps {
  navigation: NativeStackNavigationProp<MainStackParamList, 'BudgetSettings'>;
  insets: { top: number; bottom: number; left: number; right: number };
}

function getActualForFixedItem(
  transactions: { amount: number; monthlyFixedItemId?: string; type: string; date: string }[],
  itemId: string,
  year: number,
  month: number,
): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return transactions
    .filter(
      (t) =>
        t.monthlyFixedItemId === itemId &&
        t.type === 'expense' &&
        t.date.startsWith(prefix),
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

export function MonthlyBudgetTab({ navigation, insets }: MonthlyBudgetTabProps): React.JSX.Element {
  const {
    monthlyFixedItems,
    budgetSettings,
    refreshBudget,
    saveBudgetSettings,
    saveMonthlyFixedItems,
    getMonthlySavingTargetAmount,
    saveMonthlySavingTarget,
  } = useBudget();
  const { transactions } = useTransactions();
  const todayKey = getTodayKey();
  const [todayYear, todayMonth] = React.useMemo(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return [y, m];
  }, [todayKey]);

  const amortizedItems = React.useMemo(
    () => getAmortizedItemsForMonth(transactions, todayYear, todayMonth),
    [transactions, todayYear, todayMonth],
  );

  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  React.useEffect(() => {
    getStoredRecurring().then(setRecurringItems);
  }, []);

  // 每月固定收支（支出）中尚未連結到預算的項目
  const linkedRecurringIds = React.useMemo(
    () => new Set(monthlyFixedItems.map((x) => x.recurringItemId).filter(Boolean)),
    [monthlyFixedItems]
  );
  const unlinkedMonthlyExpenses = React.useMemo(
    () => recurringItems.filter(
      (r) => r.type === 'expense' && r.repeat === 'monthly' && !linkedRecurringIds.has(r.id)
    ),
    [recurringItems, linkedRecurringIds]
  );

  // 固定收入總計（用於 defaultMonthlyIncome 提示）
  const recurringMonthlyIncomeTotal = React.useMemo(
    () => recurringItems
      .filter((r) => r.type === 'income' && r.repeat === 'monthly')
      .reduce((sum, r) => sum + r.amount, 0),
    [recurringItems]
  );

  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<MonthlyFixedItem | null>(null);
  const [weekdayWeightStr, setWeekdayWeightStr] = useState('');
  const [weekendWeightStr, setWeekendWeightStr] = useState('');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [monthlySavingTargetStr, setMonthlySavingTargetStr] = useState('');
  const currentYearMonth = todayKey.slice(0, 7);

  React.useEffect(() => {
    setWeekdayWeightStr(String(budgetSettings.weekdayWeight));
    setWeekendWeightStr(String(budgetSettings.weekendWeight));
    setMonthlySavingTargetStr(String(getMonthlySavingTargetAmount(currentYearMonth)));
  }, [budgetSettings, currentYearMonth, getMonthlySavingTargetAmount]);

  const openAdd = () => {
    navigation.navigate('BudgetFixedEdit', {});
  };

  const openEdit = (item: MonthlyFixedItem) => {
    navigation.navigate('BudgetFixedEdit', { itemId: item.id });
  };

  const askDelete = (item: MonthlyFixedItem) => {
    setConfirmDeleteItem(item);
  };

  const cancelDelete = () => {
    setConfirmDeleteItem(null);
  };

  const confirmDelete = useCallback(async () => {
    const item = confirmDeleteItem;
    if (!item) return;
    const next = monthlyFixedItems
      .filter((x) => x.id !== item.id)
      .map((x, i) => ({ ...x, sortOrder: i }));
    await saveMonthlyFixedItems(next);
    setConfirmDeleteItem(null);
  }, [confirmDeleteItem, monthlyFixedItems, saveMonthlyFixedItems]);

  const handleSaveSettings = useCallback(async () => {
    const weekdayWeight = Number(weekdayWeightStr) || DEFAULT_WEEKDAY_WEIGHT;
    const weekendWeight = Number(weekendWeightStr) || DEFAULT_WEEKEND_WEIGHT;
    const monthlySavingTarget = Math.max(0, Number(monthlySavingTargetStr) || 0);
    await saveBudgetSettings({
      defaultMonthlyIncome: budgetSettings.defaultMonthlyIncome,
      weekdayWeight,
      weekendWeight,
    });
    await saveMonthlySavingTarget(currentYearMonth, monthlySavingTarget);
    setSettingsDirty(false);
  }, [
    weekdayWeightStr,
    weekendWeightStr,
    monthlySavingTargetStr,
    currentYearMonth,
    budgetSettings.defaultMonthlyIncome,
    saveBudgetSettings,
    saveMonthlySavingTarget,
  ]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              insets.bottom +
              BOTTOM_BAR_HEIGHT +
              SCROLL_BOTTOM_GAP,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <Text style={styles.sectionTitle}>{SECTION_FIXED}</Text>
        {(monthlyFixedItems.length > 0 || amortizedItems.length > 0) && (() => {
          const fixedTotal = monthlyFixedItems.reduce((sum, item) => sum + item.estimatedAmount, 0);
          const amortizedTotal = amortizedItems.reduce((sum, item) => sum + item.monthlyAmount, 0);
          const totalTWD = fixedTotal + amortizedTotal;
          const totalActual = monthlyFixedItems.reduce(
            (sum, item) => sum + getActualForFixedItem(transactions, item.id, todayYear, todayMonth),
            0,
          );
          return (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>每月預估固定花費</Text>
                <Text style={styles.summaryAmount}>NT${Math.round(totalTWD).toLocaleString()}</Text>
              </View>
              {totalActual > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>本月實際已花</Text>
                  <Text style={[styles.summaryAmount, totalActual > totalTWD && styles.summaryOver]}>
                    NT${Math.round(totalActual).toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
        {monthlyFixedItems.length === 0 ? (
          <Text style={styles.emptyHint}>{EMPTY_HINT}</Text>
        ) : (
          <View style={styles.listBlock}>
            {monthlyFixedItems.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.row,
                  index === monthlyFixedItems.length - 1 && styles.rowLast,
                ]}
              >
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() => openEdit(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.label}
                    {item.currency && item.currency !== 'TWD' ? (
                      <Text style={styles.rowCurrencyBadge}>  {item.currency}</Text>
                    ) : null}
                  </Text>
                  <View style={styles.rowAmountRow}>
                    <Text style={styles.rowAmount}>
                      預估 {item.currency && item.currency !== 'TWD' && item.originalAmount != null
                        ? `${item.originalAmount} ${item.currency} ≈ NT$${Math.round(item.estimatedAmount).toLocaleString()}`
                        : item.estimatedAmount.toLocaleString()}
                    </Text>
                    {(() => {
                      const actual = getActualForFixedItem(transactions, item.id, todayYear, todayMonth);
                      if (actual <= 0) return null;
                      const over = actual > item.estimatedAmount;
                      return (
                        <Text style={[styles.rowActual, over && styles.rowActualOver]}>
                          實際 {actual.toLocaleString()}
                        </Text>
                      );
                    })()}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => askDelete(item)}
                  hitSlop={12}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {amortizedItems.length > 0 ? (
          <View style={styles.listBlock}>
            {amortizedItems.map((item, index) => (
              <View
                key={item.transactionId}
                style={[
                  styles.row,
                  styles.rowAmortized,
                  index === amortizedItems.length - 1 && styles.rowLast,
                ]}
              >
                <View style={styles.rowMain}>
                  <View style={styles.amortizedLabelRow}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{item.note}</Text>
                    <View style={styles.amortizedBadge}>
                      <Text style={styles.amortizedBadgeText}>分期</Text>
                    </View>
                  </View>
                  <View style={styles.rowAmountRow}>
                    <Text style={styles.rowAmount}>
                      本月 {Math.round(item.monthlyAmount).toLocaleString()}
                    </Text>
                    <Text style={styles.amortizedEndDate}>
                      到期 {item.endYearMonth.replace('-', '/')}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={openAdd}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>

        {unlinkedMonthlyExpenses.length > 0 && (
          <View style={styles.unlinkedCard}>
            <View style={styles.unlinkedHeader}>
              <Ionicons name="link-outline" size={16} color="#d97706" />
              <Text style={styles.unlinkedTitle}>固定收支尚未加入預算</Text>
            </View>
            {unlinkedMonthlyExpenses.map((rec) => (
              <TouchableOpacity
                key={rec.id}
                style={styles.unlinkedRow}
                onPress={() => navigation.navigate('BudgetFixedEdit', { linkedRecurringItemId: rec.id })}
                activeOpacity={0.7}
              >
                <Text style={styles.unlinkedLabel} numberOfLines={1}>
                  {rec.note ?? '固定支出'}　NT${rec.amount.toLocaleString()}／月
                </Text>
                <View style={styles.unlinkedAddBtn}>
                  <Ionicons name="add" size={16} color="#2563eb" />
                  <Text style={styles.unlinkedAddText}>加入預算</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, styles.sectionTitleSecond]}>
          {SECTION_SETTINGS}
        </Text>
        <View style={styles.settingsBlock}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_INCOME_SOURCE}</Text>
            <Text style={styles.incomeHint}>
              每月固定收入：NT${recurringMonthlyIncomeTotal.toLocaleString()}
            </Text>
            <Text style={styles.fieldHint}>{LABEL_INCOME_SOURCE_HINT}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_WEEKDAY_WEIGHT}</Text>
            <TextInput
              style={styles.input}
              value={weekdayWeightStr}
              onChangeText={(t) => {
                setWeekdayWeightStr(t);
                setSettingsDirty(true);
              }}
              placeholder="1"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_WEEKEND_WEIGHT}</Text>
            <TextInput
              style={styles.input}
              value={weekendWeightStr}
              onChangeText={(t) => {
                setWeekendWeightStr(t);
                setSettingsDirty(true);
              }}
              placeholder="1.5"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_MONTHLY_SAVING_TARGET}</Text>
            <TextInput
              style={styles.input}
              value={monthlySavingTargetStr}
              onChangeText={(t) => {
                setMonthlySavingTargetStr(t);
                setSettingsDirty(true);
              }}
              placeholder={MONTHLY_SAVING_TARGET_PLACEHOLDER}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />
          </View>

          {settingsDirty && (
            <TouchableOpacity
              style={styles.saveSettingsBtn}
              onPress={handleSaveSettings}
              activeOpacity={0.7}
            >
              <Text style={styles.saveSettingsBtnText}>{BTN_SAVE_SETTINGS}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={confirmDeleteItem != null}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmBar, { paddingBottom: 16 }]}>
            <Text style={styles.confirmText} numberOfLines={1}>
              確定要刪除「{confirmDeleteItem?.label}」？
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={cancelDelete}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={confirmDelete}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmDeleteText}>刪除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  sectionTitleSecond: {
    marginTop: 24,
  },
  summaryCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#1d4ed8',
  },
  summaryAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  summaryOver: {
    color: '#dc2626',
  },
  emptyHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 24,
  },
  listBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowMain: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  rowCurrencyBadge: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  rowAmountRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 14,
    color: '#6b7280',
  },
  rowActual: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  rowActualOver: {
    color: '#dc2626',
  },
  iconBtn: {
    padding: 12,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  settingsBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginTop: 8,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  incomeHint: {
    fontSize: 12,
    color: '#2563eb',
    marginTop: 4,
  },
  unlinkedCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  unlinkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  unlinkedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
  },
  unlinkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
  },
  unlinkedLabel: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  unlinkedAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  unlinkedAddText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },

  saveSettingsBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveSettingsBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  confirmBar: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  confirmText: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 12,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  confirmDeleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  rowAmortized: {
    backgroundColor: '#f8fafc',
  },
  amortizedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  amortizedBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  amortizedBadgeText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
  },
  amortizedEndDate: {
    fontSize: 13,
    color: '#9ca3af',
  },
});
