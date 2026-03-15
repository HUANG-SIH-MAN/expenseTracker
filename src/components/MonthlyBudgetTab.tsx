/**
 * 月預算 Tab：每月固定/預估支出列表 + 預算設定（月收入、權重、固定類別）
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { MonthlyFixedItem } from '../types';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';

const SECTION_FIXED = '每月固定/預估支出';
const SECTION_SETTINGS = '預算設定';
const BTN_ADD = '新增固定支出';
const LABEL_DEFAULT_INCOME = '預設月收入';
const LABEL_DEFAULT_INCOME_HINT = '未記帳時用於計算可支配額';
const LABEL_WEEKDAY_WEIGHT = '平日權重';
const LABEL_WEEKEND_WEIGHT = '假日權重';
const LABEL_FIXED_CATEGORIES = '固定支出類別';
const LABEL_FIXED_CATEGORIES_HINT = '勾選的類別不計入「日常已花」';
const BTN_SAVE_SETTINGS = '儲存設定';
const EMPTY_HINT = '尚無固定支出項目，可點下方按鈕新增';

interface MonthlyBudgetTabProps {
  navigation: NativeStackNavigationProp<MainStackParamList, 'BudgetSettings'>;
  insets: { top: number; bottom: number; left: number; right: number };
}

export function MonthlyBudgetTab({ navigation, insets }: MonthlyBudgetTabProps): React.JSX.Element {
  const {
    monthlyFixedItems,
    budgetSettings,
    refreshBudget,
    saveBudgetSettings,
    saveMonthlyFixedItems,
  } = useBudget();
  const { expenseCategories, getCategoryLabel } = useCategories();

  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<MonthlyFixedItem | null>(null);
  const [defaultIncomeStr, setDefaultIncomeStr] = useState('');
  const [weekdayWeightStr, setWeekdayWeightStr] = useState('');
  const [weekendWeightStr, setWeekendWeightStr] = useState('');
  const [fixedKeys, setFixedKeys] = useState<string[]>([]);
  const [settingsDirty, setSettingsDirty] = useState(false);

  React.useEffect(() => {
    setDefaultIncomeStr(String(budgetSettings.defaultMonthlyIncome));
    setWeekdayWeightStr(String(budgetSettings.weekdayWeight));
    setWeekendWeightStr(String(budgetSettings.weekendWeight));
    setFixedKeys(budgetSettings.fixedExpenseCategoryKeys);
  }, [budgetSettings]);

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

  const toggleFixedCategory = (key: string) => {
    setFixedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setSettingsDirty(true);
  };

  const handleSaveSettings = useCallback(async () => {
    const defaultMonthlyIncome = Number(defaultIncomeStr) || 0;
    const weekdayWeight = Number(weekdayWeightStr) || 1;
    const weekendWeight = Number(weekendWeightStr) || 1.5;
    await saveBudgetSettings({
      defaultMonthlyIncome,
      weekdayWeight,
      weekendWeight,
      fixedExpenseCategoryKeys: fixedKeys,
    });
    setSettingsDirty(false);
  }, [
    defaultIncomeStr,
    weekdayWeightStr,
    weekendWeightStr,
    fixedKeys,
    saveBudgetSettings,
  ]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>{SECTION_FIXED}</Text>
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
                  </Text>
                  <Text style={styles.rowAmount}>
                    預估 {item.estimatedAmount}
                  </Text>
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
        <TouchableOpacity
          style={styles.addBtn}
          onPress={openAdd}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, styles.sectionTitleSecond]}>
          {SECTION_SETTINGS}
        </Text>
        <View style={styles.settingsBlock}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_DEFAULT_INCOME}</Text>
            <TextInput
              style={styles.input}
              value={defaultIncomeStr}
              onChangeText={(t) => {
                setDefaultIncomeStr(t);
                setSettingsDirty(true);
              }}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />
            <Text style={styles.fieldHint}>{LABEL_DEFAULT_INCOME_HINT}</Text>
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
            <Text style={styles.fieldLabel}>{LABEL_FIXED_CATEGORIES}</Text>
            <Text style={styles.fieldHint}>{LABEL_FIXED_CATEGORIES_HINT}</Text>
            <View style={styles.checkboxList}>
              {expenseCategories.map((c) => {
                const checked = fixedKeys.includes(c.key);
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={styles.checkboxRow}
                    onPress={() => toggleFixedCategory(c.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? '#2563eb' : '#9ca3af'}
                    />
                    <Text style={styles.checkboxLabel}>
                      {getCategoryLabel('expense', c.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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

      {confirmDeleteItem != null ? (
        <View
          style={[styles.confirmBar, { paddingBottom: insets.bottom + 12 }]}
        >
          <Text style={styles.confirmText} numberOfLines={1}>
            確定要刪除「{confirmDeleteItem.label}」？
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
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
  rowAmount: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
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
  checkboxList: {
    marginTop: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#374151',
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
});
