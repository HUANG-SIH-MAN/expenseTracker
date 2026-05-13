/**
 * 年預算 Tab：選年份 → 單一列表顯示該年所有年度項目；每筆顯示月份、類別、類型、計劃/實際金額；新增/編輯時可選月份。
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AnnualBudgetEntry, TransactionType } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { useTransactions } from '../contexts/TransactionsContext';
import { getAnnualBudgetEntries, saveAnnualBudgetEntries, getStoredAccounts, getStoredPrimaryCurrency } from '../utils/storage';
import { buildAccountCostBasisMap } from '../utils/balance';
import { generateId } from '../utils/id';
import type { Account } from '../types';

const MONTHS = 12;
const YEAR_RANGE_PAST = 10;
const YEAR_RANGE_FUTURE = 3;
const LABEL_YEAR = '年份';
const BTN_ADD_ITEM = '新增項目';
const EMPTY_LIST = '尚無年度預算項目';
const LABEL_PLANNED = '計劃';
const LABEL_ACTUAL = '實際';
const SUMMARY_PLANNED_INCOME = '計劃收入';
const SUMMARY_PLANNED_EXPENSE = '計劃支出';
const SUMMARY_PLANNED_BALANCE = '計劃結餘';
const SUMMARY_ACTUAL_INCOME = '實際收入';
const SUMMARY_ACTUAL_EXPENSE = '實際支出';
const SUMMARY_ACTUAL_BALANCE = '實際結餘';
const INCOME_LABEL = '收入';
const EXPENSE_LABEL = '支出';
const MODAL_TITLE_ADD = '新增年度項目';
const MODAL_TITLE_EDIT = '編輯年度項目';
const LABEL_MONTH = '月份';
const LABEL_TYPE = '類型';
const LABEL_CATEGORY = '類別';
const LABEL_ITEM_NAME = '項目名稱（選填）';
const LABEL_ITEM_NAME_PLACEHOLDER = '例如：汽車保養、年終獎金';
const LABEL_ESTIMATED = '計劃金額';
const BTN_SAVE = '儲存';
const BTN_CANCEL = '取消';
const BTN_COPY_YEAR = '複製到其他年份';
const COPY_MODAL_TITLE = '複製年度預算';
const COPY_MODAL_DESC = '將目前年份的所有項目複製到：';
const COPY_OVERWRITE_WARNING = '筆項目，是否要覆蓋？';
const COPY_OVERWRITE_CONFIRM = '覆蓋並複製';
const COPY_SUCCESS_EMPTY = '已複製完成';
const BTN_COPY = '複製';

const BOTTOM_BAR_HEIGHT = 56;
const SCROLL_BOTTOM_GAP = 24;

interface AnnualBudgetTabProps {
  insets: { top: number; bottom: number; left: number; right: number };
}

function getActualAmount(
  transactions: { amount: number; annualBudgetEntryId?: string; accountId?: string }[],
  entryId: string,
  accountCostBasisMap?: Map<string, number>,
): number {
  return transactions
    .filter((t) => t.annualBudgetEntryId === entryId)
    .reduce((sum, t) => {
      const rate = accountCostBasisMap?.get(t.accountId ?? '') ?? 1;
      return sum + t.amount * rate;
    }, 0);
}

export function AnnualBudgetTab({ insets }: AnnualBudgetTabProps): React.JSX.Element {
  const { transactions } = useTransactions();
  const { getCategoryLabel, incomeCategories, expenseCategories } = useCategories();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [entries, setEntries] = useState<AnnualBudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AnnualBudgetEntry | null>(null);
  const [formMonth, setFormMonth] = useState(1);
  const [formType, setFormType] = useState<TransactionType>('expense');
  const [formCategoryKey, setFormCategoryKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formAmountStr, setFormAmountStr] = useState('');
  const [formAccountId, setFormAccountId] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<AnnualBudgetEntry | null>(null);
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [copyTargetYear, setCopyTargetYear] = useState(currentYear + 1);
  const [copyTargetEntryCount, setCopyTargetEntryCount] = useState(0);
  const [copyConfirmOverwrite, setCopyConfirmOverwrite] = useState(false);

  const [primaryCurrency, setPrimaryCurrency] = React.useState<string>('TWD');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const list = await getAnnualBudgetEntries(year);
    setEntries(list);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    loadEntries();
    getStoredAccounts().then(list => setAccounts(list.filter(a => !a.isDeleted)));
    getStoredPrimaryCurrency().then(setPrimaryCurrency);
  }, [loadEntries]);

  useEffect(() => {
    const list = formType === 'income' ? incomeCategories : expenseCategories;
    const first = list[0]?.key ?? '';
    if (!list.some((c) => c.key === formCategoryKey)) {
      setFormCategoryKey(first);
    }
  }, [formType, incomeCategories, expenseCategories, formCategoryKey]);

  const openAdd = (month?: number) => {
    setEditingEntry(null);
    setFormMonth(month ?? 1);
    setFormType('expense');
    setFormCategoryKey(expenseCategories[0]?.key ?? '');
    setFormLabel('');
    setFormAmountStr('');
    setFormAccountId('');
    setModalVisible(true);
  };

  const openEdit = (entry: AnnualBudgetEntry) => {
    setEditingEntry(entry);
    setFormMonth(entry.month);
    setFormType(entry.type);
    setFormCategoryKey(entry.categoryKey);
    setFormLabel(entry.label ?? '');
    setFormAmountStr(String(entry.estimatedAmount));
    setFormAccountId(entry.accountId ?? '');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingEntry(null);
  };

  const handleSaveEntry = useCallback(async () => {
    const amount = Number(formAmountStr);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const list = [...entries];
    const labelTrimmed = formLabel.trim() || undefined;
    if (editingEntry) {
      const idx = list.findIndex((e) => e.id === editingEntry.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          month: formMonth,
          type: formType,
          categoryKey: formCategoryKey,
          accountId: formAccountId === '' ? undefined : formAccountId,
          label: labelTrimmed,
          estimatedAmount: amount,
        };
      }
    } else {
      const maxOrder = list.length === 0 ? 0 : Math.max(...list.map((e) => e.sortOrder), 0);
      list.push({
        id: generateId(),
        year,
        month: formMonth,
        type: formType,
        categoryKey: formCategoryKey,
        accountId: formAccountId === '' ? undefined : formAccountId,
        label: labelTrimmed,
        estimatedAmount: amount,
        sortOrder: maxOrder + 1,
      });
    }
    await saveAnnualBudgetEntries(year, list);
    setEntries(list);
    closeModal();
  }, [year, entries, editingEntry, formMonth, formType, formCategoryKey, formLabel, formAmountStr]);

  const askDelete = (entry: AnnualBudgetEntry) => setConfirmDelete(entry);
  const cancelDelete = () => setConfirmDelete(null);
  const confirmDeleteEntry = useCallback(async () => {
    if (!confirmDelete) return;
    const next = entries.filter((e) => e.id !== confirmDelete.id);
    await saveAnnualBudgetEntries(year, next);
    setEntries(next);
    setConfirmDelete(null);
  }, [confirmDelete, entries, year]);

  const openCopyModal = useCallback(async () => {
    const defaultTarget = year >= currentYear ? year + 1 : currentYear;
    setCopyTargetYear(defaultTarget);
    setCopyConfirmOverwrite(false);
    const existing = await getAnnualBudgetEntries(defaultTarget);
    setCopyTargetEntryCount(existing.length);
    setCopyModalVisible(true);
  }, [year, currentYear]);

  const handleCopyTargetYearChange = useCallback(async (y: number) => {
    setCopyTargetYear(y);
    setCopyConfirmOverwrite(false);
    const existing = await getAnnualBudgetEntries(y);
    setCopyTargetEntryCount(existing.length);
  }, []);

  const handleCopyConfirm = useCallback(async () => {
    if (entries.length === 0) return;
    if (copyTargetEntryCount > 0 && !copyConfirmOverwrite) {
      setCopyConfirmOverwrite(true);
      return;
    }
    const copied = entries.map((e, i) => ({
      ...e,
      id: generateId(),
      year: copyTargetYear,
      sortOrder: e.sortOrder,
    }));
    await saveAnnualBudgetEntries(copyTargetYear, copied);
    setCopyModalVisible(false);
    setCopyConfirmOverwrite(false);
  }, [entries, copyTargetYear, copyTargetEntryCount, copyConfirmOverwrite]);

  const sortedEntries = React.useMemo(() => {
    return [...entries]
      .filter((e) => e.month >= 0 && e.month <= MONTHS)
      .sort((a, b) => a.month - b.month || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }, [entries]);

  const yearOptions = React.useMemo(() => {
    const cur = new Date().getFullYear();
    const list: number[] = [];
    for (let y = cur - YEAR_RANGE_PAST; y <= cur + YEAR_RANGE_FUTURE; y++) {
      list.push(y);
    }
    return list.reverse();
  }, []);

  const costBasisMap = React.useMemo(
    () => buildAccountCostBasisMap(accounts, transactions, primaryCurrency),
    [accounts, transactions, primaryCurrency]
  );

  const summary = React.useMemo(() => {
    let plannedIncome = 0;
    let plannedExpense = 0;
    let actualIncome = 0;
    let actualExpense = 0;
    for (const e of entries) {
      if (e.type === 'income') {
        plannedIncome += e.estimatedAmount;
        actualIncome += getActualAmount(transactions, e.id, costBasisMap);
      } else {
        plannedExpense += e.estimatedAmount;
        actualExpense += getActualAmount(transactions, e.id, costBasisMap);
      }
    }
    return {
      plannedIncome,
      plannedExpense,
      plannedBalance: plannedIncome - plannedExpense,
      actualIncome,
      actualExpense,
      actualBalance: actualIncome - actualExpense,
    };
  }, [entries, transactions]);

  return (
    <View style={styles.container}>
      <View style={styles.yearRow}>
        <Text style={styles.yearLabel}>{LABEL_YEAR}</Text>
        <TouchableOpacity
          style={styles.yearDropdown}
          onPress={() => setYearPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.yearValue}>{year}</Text>
          <Ionicons name="chevron-down" size={22} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={yearPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setYearPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.yearPickerContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.yearPickerTitle}>{LABEL_YEAR}</Text>
            <ScrollView style={styles.yearPickerList}>
              {yearOptions.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearPickerItem, year === y && styles.yearPickerItemActive]}
                  onPress={() => {
                    setYear(y);
                    setYearPickerVisible(false);
                  }}
                >
                  <Text style={[styles.yearPickerItemText, year === y && styles.yearPickerItemTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <Text style={styles.loadingText}>載入中…</Text>
      ) : (
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
        >
          <View style={styles.listHeader}>
            <TouchableOpacity
              style={styles.addItemBtn}
              onPress={() => openAdd()}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
              <Text style={styles.addItemBtnText}>{BTN_ADD_ITEM}</Text>
            </TouchableOpacity>
            {entries.length > 0 && (
              <TouchableOpacity
                style={styles.copyYearBtn}
                onPress={openCopyModal}
                activeOpacity={0.7}
              >
                <Ionicons name="copy-outline" size={18} color="#6b7280" />
                <Text style={styles.copyYearBtnText}>{BTN_COPY_YEAR}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{SUMMARY_PLANNED_INCOME}</Text>
              <Text style={styles.summaryValue}>{summary.plannedIncome}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{SUMMARY_PLANNED_EXPENSE}</Text>
              <Text style={[styles.summaryValue, styles.summaryExpense]}>{summary.plannedExpense}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
              <Text style={styles.summaryLabel}>{SUMMARY_PLANNED_BALANCE}</Text>
              <Text style={[styles.summaryValue, summary.plannedBalance >= 0 ? styles.summaryPositive : styles.summaryNegative]}>
                {summary.plannedBalance}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{SUMMARY_ACTUAL_INCOME}</Text>
              <Text style={styles.summaryValue}>{summary.actualIncome}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{SUMMARY_ACTUAL_EXPENSE}</Text>
              <Text style={[styles.summaryValue, styles.summaryExpense]}>{summary.actualExpense}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
              <Text style={styles.summaryLabel}>{SUMMARY_ACTUAL_BALANCE}</Text>
              <Text style={[styles.summaryValue, summary.actualBalance >= 0 ? styles.summaryPositive : styles.summaryNegative]}>
                {summary.actualBalance}
              </Text>
            </View>
          </View>

          {sortedEntries.length === 0 ? (
            <Text style={styles.emptyList}>{EMPTY_LIST}</Text>
          ) : (
            <View style={styles.entryList}>
              {sortedEntries.map((entry) => {
                const actual = getActualAmount(transactions, entry.id, costBasisMap);
                const categoryLabel = getCategoryLabel(entry.type, entry.categoryKey);
                const displayName = entry.label
                  ? `${entry.label}（${categoryLabel}）`
                  : categoryLabel;
                return (
                  <View key={entry.id} style={styles.entryRow}>
                    <TouchableOpacity
                      style={styles.entryMain}
                      onPress={() => openEdit(entry)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.entryLabel} numberOfLines={1}>
                        {entry.month === 0 ? '全年度' : `${entry.month}月`} · {entry.type === 'income' ? INCOME_LABEL : EXPENSE_LABEL} · {displayName}
                      </Text>
                      <View style={styles.entryAmounts}>
                        <Text style={styles.entryPlanned}>
                          {LABEL_PLANNED} {entry.estimatedAmount}
                        </Text>
                        <Text style={styles.entryActual}>
                          {LABEL_ACTUAL} {actual}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.entryDelete}
                      onPress={() => askDelete(entry)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeModal}
          >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContentWrapper}
          >
            <ScrollView
              style={styles.modalContent}
              contentContainerStyle={styles.modalContentInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>
              {editingEntry ? MODAL_TITLE_EDIT : MODAL_TITLE_ADD}
            </Text>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_MONTH}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.monthChips}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, formMonth === m && styles.chipActive]}
                      onPress={() => setFormMonth(m)}
                    >
                      <Text style={[styles.chipText, formMonth === m && styles.chipTextActive]}>{m === 0 ? '不限月份 / 全年' : `${m} 月`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_TYPE}</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeChip, formType === 'expense' && styles.chipActive]}
                  onPress={() => setFormType('expense')}
                >
                  <Text style={[styles.chipText, formType === 'expense' && styles.chipTextActive]}>{EXPENSE_LABEL}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, formType === 'income' && styles.chipActive]}
                  onPress={() => setFormType('income')}
                >
                  <Text style={[styles.chipText, formType === 'income' && styles.chipTextActive]}>{INCOME_LABEL}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_CATEGORY}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {(formType === 'income' ? incomeCategories : expenseCategories).map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, formCategoryKey === c.key && styles.chipActive]}
                    onPress={() => setFormCategoryKey(c.key)}
                  >
                    <Text style={[styles.chipText, formCategoryKey === c.key && styles.chipTextActive]}>
                      {getCategoryLabel(formType, c.key)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_ITEM_NAME}</Text>
              <TextInput
                style={styles.modalInput}
                value={formLabel}
                onChangeText={setFormLabel}
                placeholder={LABEL_ITEM_NAME_PLACEHOLDER}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_ESTIMATED}</Text>
              <TextInput
                style={styles.modalInput}
                value={formAmountStr}
                onChangeText={setFormAmountStr}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>綁定帳戶（選填）</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.monthChips}>
                  <TouchableOpacity
                    style={[styles.chip, formAccountId === '' && styles.chipActive]}
                    onPress={() => setFormAccountId('')}
                  >
                    <Text style={[styles.chipText, formAccountId === '' && styles.chipTextActive]}>不綁定</Text>
                  </TouchableOpacity>
                  {accounts.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.chip, formAccountId === a.id && styles.chipActive]}
                      onPress={() => setFormAccountId(a.id)}
                    >
                      <Text style={[styles.chipText, formAccountId === a.id && styles.chipTextActive]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelBtnText}>{BTN_CANCEL}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEntry}
              >
                <Text style={styles.saveBtnText}>{BTN_SAVE}</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={copyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setCopyModalVisible(false); setCopyConfirmOverwrite(false); }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setCopyModalVisible(false); setCopyConfirmOverwrite(false); }}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>{COPY_MODAL_TITLE}</Text>
            <Text style={styles.copyModalDesc}>{COPY_MODAL_DESC}</Text>
            <ScrollView style={styles.yearPickerList}>
              {yearOptions.map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearPickerItem, copyTargetYear === y && styles.yearPickerItemActive]}
                  onPress={() => handleCopyTargetYearChange(y)}
                >
                  <Text style={[styles.yearPickerItemText, copyTargetYear === y && styles.yearPickerItemTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {copyConfirmOverwrite && copyTargetEntryCount > 0 && (
              <Text style={styles.copyOverwriteWarning}>
                目標年份已有 {copyTargetEntryCount} {COPY_OVERWRITE_WARNING}
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setCopyModalVisible(false); setCopyConfirmOverwrite(false); }}
              >
                <Text style={styles.cancelBtnText}>{BTN_CANCEL}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCopyConfirm}>
                <Text style={styles.saveBtnText}>
                  {copyTargetEntryCount > 0 && !copyConfirmOverwrite ? BTN_COPY : copyConfirmOverwrite ? COPY_OVERWRITE_CONFIRM : BTN_COPY}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {confirmDelete != null ? (
        <View style={[styles.confirmBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.confirmText} numberOfLines={1}>
            確定要刪除此年度項目？
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={cancelDelete}>
              <Text style={styles.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmDeleteBtn} onPress={confirmDeleteEntry}>
              <Text style={styles.confirmDeleteText}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  yearLabel: { fontSize: 16, fontWeight: '600', color: '#374151' },
  yearDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  yearValue: { fontSize: 18, fontWeight: '700', color: '#1f2937', minWidth: 48, textAlign: 'center' },
  yearPickerContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
  },
  yearPickerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 12 },
  yearPickerList: { maxHeight: 320 },
  yearPickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 4,
  },
  yearPickerItemActive: { backgroundColor: '#2563eb' },
  yearPickerItemText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  yearPickerItemTextActive: { color: '#fff' },
  loadingText: { padding: 24, textAlign: 'center', color: '#6b7280' },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  summaryRowHighlight: { paddingVertical: 8, marginTop: 4 },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  summaryExpense: { color: '#dc2626' },
  summaryPositive: { color: '#059669' },
  summaryNegative: { color: '#dc2626' },
  summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  listHeader: { marginBottom: 12 },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addItemBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  emptyList: { padding: 24, fontSize: 14, color: '#6b7280', textAlign: 'center' },
  entryList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  entryMain: { flex: 1 },
  entryLabel: { fontSize: 15, fontWeight: '500', color: '#1f2937' },
  entryAmounts: { flexDirection: 'row', gap: 12, marginTop: 4 },
  entryPlanned: { fontSize: 13, color: '#6b7280' },
  entryActual: { fontSize: 13, color: '#059669', fontWeight: '500' },
  entryDelete: { padding: 8 },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentWrapper: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  modalContent: {
    width: '100%',
  },
  modalContentInner: {
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937', marginBottom: 16 },
  modalField: { marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  monthChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  chipTextActive: { color: '#fff' },
  categoryScroll: { maxHeight: 120 },
  modalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  confirmBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  confirmText: { fontSize: 15, color: '#374151', marginBottom: 12 },
  confirmActions: { flexDirection: 'row', gap: 12 },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  confirmCancelText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  confirmDeleteText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  copyYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  copyYearBtnText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  copyModalDesc: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  copyOverwriteWarning: { fontSize: 13, color: '#d97706', marginTop: 8, marginBottom: 4 },
});
