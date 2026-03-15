/**
 * 年預算 Tab：選年份 → 依 1–12 月顯示年度項目；每筆顯示類別、類型、計劃金額、實際金額；新增/編輯/刪除。
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
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AnnualBudgetEntry, TransactionType } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { useTransactions } from '../contexts/TransactionsContext';
import { getAnnualBudgetEntries, saveAnnualBudgetEntries } from '../utils/storage';
import { generateId } from '../utils/id';

const MONTHS = 12;
const LABEL_YEAR = '年份';
const BTN_ADD_MONTH = '新增該月項目';
const EMPTY_MONTH = '該月尚無規劃';
const LABEL_PLANNED = '計劃';
const LABEL_ACTUAL = '實際';
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

interface AnnualBudgetTabProps {
  insets: { top: number; bottom: number; left: number; right: number };
}

function getActualAmount(transactions: { amount: number; annualBudgetEntryId?: string }[], entryId: string): number {
  return transactions
    .filter((t) => t.annualBudgetEntryId === entryId)
    .reduce((sum, t) => sum + t.amount, 0);
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
  const [confirmDelete, setConfirmDelete] = useState<AnnualBudgetEntry | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const list = await getAnnualBudgetEntries(year);
    setEntries(list);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    loadEntries();
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
    setModalVisible(true);
  };

  const openEdit = (entry: AnnualBudgetEntry) => {
    setEditingEntry(entry);
    setFormMonth(entry.month);
    setFormType(entry.type);
    setFormCategoryKey(entry.categoryKey);
    setFormLabel(entry.label ?? '');
    setFormAmountStr(String(entry.estimatedAmount));
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

  const entriesByMonth = React.useMemo(() => {
    const map: Record<number, AnnualBudgetEntry[]> = {};
    for (let m = 1; m <= MONTHS; m++) map[m] = [];
    for (const e of entries) {
      if (e.month >= 1 && e.month <= MONTHS) map[e.month].push(e);
    }
    for (let m = 1; m <= MONTHS; m++) {
      map[m].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    }
    return map;
  }, [entries]);

  return (
    <View style={styles.container}>
      <View style={styles.yearRow}>
        <Text style={styles.yearLabel}>{LABEL_YEAR}</Text>
        <View style={styles.yearControls}>
          <TouchableOpacity
            style={styles.yearBtn}
            onPress={() => setYear((y) => y - 1)}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color="#2563eb" />
          </TouchableOpacity>
          <Text style={styles.yearValue}>{year}</Text>
          <TouchableOpacity
            style={styles.yearBtn}
            onPress={() => setYear((y) => y + 1)}
            hitSlop={12}
          >
            <Ionicons name="chevron-forward" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <Text style={styles.loadingText}>載入中…</Text>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
            const monthEntries = entriesByMonth[month] ?? [];
            return (
              <View key={month} style={styles.monthBlock}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthTitle}>{month} 月</Text>
                  <TouchableOpacity
                    style={styles.addMonthBtn}
                    onPress={() => openAdd(month)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
                    <Text style={styles.addMonthBtnText}>{BTN_ADD_MONTH}</Text>
                  </TouchableOpacity>
                </View>
                {monthEntries.length === 0 ? (
                  <Text style={styles.emptyMonth}>{EMPTY_MONTH}</Text>
                ) : (
                  <View style={styles.entryList}>
                    {monthEntries.map((entry) => {
                      const actual = getActualAmount(transactions, entry.id);
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
                              {entry.type === 'income' ? INCOME_LABEL : EXPENSE_LABEL} · {displayName}
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
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeModal}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {editingEntry ? MODAL_TITLE_EDIT : MODAL_TITLE_ADD}
            </Text>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{LABEL_MONTH}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.monthChips}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, formMonth === m && styles.chipActive]}
                      onPress={() => setFormMonth(m)}
                    >
                      <Text style={[styles.chipText, formMonth === m && styles.chipTextActive]}>{m} 月</Text>
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
  yearControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  yearBtn: { padding: 4 },
  yearValue: { fontSize: 18, fontWeight: '700', color: '#1f2937', minWidth: 48, textAlign: 'center' },
  loadingText: { padding: 24, textAlign: 'center', color: '#6b7280' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  monthBlock: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  monthTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  addMonthBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addMonthBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  emptyMonth: { padding: 16, fontSize: 14, color: '#6b7280', textAlign: 'center' },
  entryList: {},
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
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
});
