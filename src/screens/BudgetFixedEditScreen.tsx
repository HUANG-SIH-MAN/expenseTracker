/**
 * 每月固定/預估支出項目：新增或編輯一筆
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { MonthlyFixedItem } from '../types';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';
import { generateId } from '../utils/id';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增固定支出';
const TITLE_EDIT = '編輯固定支出';
const LABEL_NAME = '項目名稱';
const LABEL_AMOUNT = '當月預估金額';
const LABEL_CATEGORY = '綁定類別（選填）';
const PLACEHOLDER_NAME = '例如：ETF A、家用';
const BTN_SAVE = '儲存';
const BTN_DELETE = '刪除';
const CATEGORY_NONE = '';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'BudgetFixedEdit'>;
type RouteProps =
  NativeStackScreenProps<MainStackParamList, 'BudgetFixedEdit'>['route'];

export default function BudgetFixedEditScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const itemId = route.params?.itemId;

  const { monthlyFixedItems, saveMonthlyFixedItems } = useBudget();
  const { expenseCategories } = useCategories();
  const [label, setLabel] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [categoryKey, setCategoryKey] = useState<string>(CATEGORY_NONE);

  const isEdit = Boolean(itemId);

  useEffect(() => {
    if (itemId) {
      const item = monthlyFixedItems.find((x) => x.id === itemId);
      if (item) {
        setLabel(item.label);
        setAmountStr(String(item.estimatedAmount));
        setCategoryKey(item.categoryKey ?? CATEGORY_NONE);
      }
    }
  }, [itemId, monthlyFixedItems]);

  const amount = Number(amountStr) || 0;
  const canSave =
    label.trim().length > 0 && amount >= 0 && !Number.isNaN(amount);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const trimmedLabel = label.trim();
    if (isEdit && itemId) {
      const next = monthlyFixedItems.map((x) =>
        x.id === itemId
          ? {
              ...x,
              label: trimmedLabel,
              estimatedAmount: amount,
              categoryKey:
                categoryKey === CATEGORY_NONE ? undefined : categoryKey,
            }
          : x
      );
      await saveMonthlyFixedItems(next);
    } else {
      const newItem: MonthlyFixedItem = {
        id: generateId(),
        label: trimmedLabel,
        estimatedAmount: amount,
        categoryKey:
          categoryKey === CATEGORY_NONE ? undefined : categoryKey,
        sortOrder: monthlyFixedItems.length,
      };
      await saveMonthlyFixedItems([...monthlyFixedItems, newItem]);
    }
    navigation.goBack();
  }, [
    canSave,
    isEdit,
    itemId,
    label,
    amount,
    categoryKey,
    monthlyFixedItems,
    saveMonthlyFixedItems,
    navigation,
  ]);

  const handleDelete = useCallback(async () => {
    if (!isEdit || !itemId) return;
    const next = monthlyFixedItems
      .filter((x) => x.id !== itemId)
      .map((x, i) => ({ ...x, sortOrder: i }));
    await saveMonthlyFixedItems(next);
    navigation.goBack();
  }, [isEdit, itemId, monthlyFixedItems, saveMonthlyFixedItems, navigation]);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isEdit ? TITLE_EDIT : TITLE_ADD}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{LABEL_NAME}</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder={PLACEHOLDER_NAME}
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{LABEL_AMOUNT}</Text>
          <TextInput
            style={styles.input}
            value={amountStr}
            onChangeText={setAmountStr}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{LABEL_CATEGORY}</Text>
          <View style={styles.categoryWrap}>
            <TouchableOpacity
              style={[
                styles.categoryChip,
                categoryKey === CATEGORY_NONE && styles.categoryChipSelected,
              ]}
              onPress={() => setCategoryKey(CATEGORY_NONE)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  categoryKey === CATEGORY_NONE && styles.categoryChipTextSelected,
                ]}
              >
                不綁定
              </Text>
            </TouchableOpacity>
            {expenseCategories.map((c) => {
              const selected = categoryKey === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.categoryChip,
                    selected && styles.categoryChipSelected,
                  ]}
                  onPress={() => setCategoryKey(c.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selected && styles.categoryChipTextSelected,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveBtnText}>{BTN_SAVE}</Text>
        </TouchableOpacity>

        {isEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
            <Text style={styles.deleteBtnText}>{BTN_DELETE}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  field: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryChipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#374151',
  },
  categoryChipTextSelected: {
    color: '#fff',
  },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 12,
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
});
