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
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { MonthlyFixedItem, RecurringItem } from '../types';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';
import { generateId } from '../utils/id';
import { getExchangeRates, getStoredRecurring } from '../utils/storage';
import { fetchRatesToPrimary } from '../utils/exchangeRate';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增固定支出';
const TITLE_EDIT = '編輯固定支出';
const LABEL_NAME = '項目名稱';
const LABEL_RECURRING_LINK = '連結固定收支（選填）';
const LABEL_CURRENCY = '幣別';
const LABEL_AMOUNT = '金額';
const LABEL_RATE_PREVIEW = '換算預覽';
const LABEL_CATEGORY = '綁定類別（選填）';
const PLACEHOLDER_NAME = '例如：家用、薪水';
const BTN_SAVE = '儲存';
const BTN_DELETE = '刪除';
const CATEGORY_NONE = '';
const RECURRING_NONE = '';
const RECURRING_PICKER_TITLE = '選擇固定收支項目';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'BudgetFixedEdit'>;
type RouteProps =
  NativeStackScreenProps<MainStackParamList, 'BudgetFixedEdit'>['route'];

const SUPPORTED_CURRENCIES = ['TWD', 'USD'] as const;
type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export default function BudgetFixedEditScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const itemId = route.params?.itemId;
  const linkedRecurringItemIdParam = route.params?.linkedRecurringItemId;

  const { monthlyFixedItems, saveMonthlyFixedItems } = useBudget();
  const { expenseCategories } = useCategories();
  const [label, setLabel] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>('TWD');
  const [categoryKey, setCategoryKey] = useState<string>(CATEGORY_NONE);

  const [recurringItemId, setRecurringItemId] = useState<string>(RECURRING_NONE);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [showRecurringPicker, setShowRecurringPicker] = useState(false);

  const [ratesToPrimary, setRatesToPrimary] = useState<Record<string, number>>({});
  const [rateLoading, setRateLoading] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState('');

  const isEdit = Boolean(itemId);
  // 連結固定收支時，名稱/金額由 RecurringItem 決定，不可手動填
  const isLinked = recurringItemId !== RECURRING_NONE;

  useEffect(() => {
    getStoredRecurring().then((list) => {
      const monthly = list.filter((r) => r.type === 'expense' && r.repeat === 'monthly');
      setRecurringItems(monthly);
      // 從列表快速加入時，自動預選該項目
      if (linkedRecurringItemIdParam && !itemId) {
        setRecurringItemId(linkedRecurringItemIdParam);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (itemId) {
      const item = monthlyFixedItems.find((x) => x.id === itemId);
      if (item) {
        setLabel(item.label);
        setRecurringItemId(item.recurringItemId ?? RECURRING_NONE);
        const itemCurrency = (item.currency as SupportedCurrency | undefined) ?? 'TWD';
        setCurrency(itemCurrency);
        if (itemCurrency !== 'TWD' && item.originalAmount != null) {
          setAmountStr(String(item.originalAmount));
        } else {
          setAmountStr(String(item.estimatedAmount));
        }
        setCategoryKey(item.categoryKey ?? CATEGORY_NONE);
      }
    }
  }, [itemId, monthlyFixedItems]);

  // 連結 RecurringItem 時自動帶入名稱、金額、類別
  useEffect(() => {
    if (!isLinked) return;
    const rec = recurringItems.find((r) => r.id === recurringItemId);
    if (!rec) return;
    setLabel(rec.note ?? `固定支出 ${rec.amount}`);
    setAmountStr(String(rec.amount));
    setCurrency('TWD');
    setCategoryKey(rec.category);
  }, [recurringItemId, recurringItems, isLinked]);

  // 載入已儲存的匯率
  useEffect(() => {
    getExchangeRates().then(({ rates, updatedAt }) => {
      setRatesToPrimary(rates);
      setRateUpdatedAt(updatedAt);
    });
  }, []);

  const handleRefreshRate = useCallback(async () => {
    setRateLoading(true);
    const fresh = await fetchRatesToPrimary('TWD');
    if (fresh) {
      setRatesToPrimary(fresh);
      setRateUpdatedAt(new Date().toISOString());
    }
    setRateLoading(false);
  }, []);

  const originalAmount = Number(amountStr) || 0;

  const twdAmount = React.useMemo(() => {
    if (currency === 'TWD') return originalAmount;
    const rate = ratesToPrimary[currency] ?? 0;
    return originalAmount * rate;
  }, [currency, originalAmount, ratesToPrimary]);

  const currentRate = currency !== 'TWD' ? (ratesToPrimary[currency] ?? null) : null;

  const rateUpdatedLabel = React.useMemo(() => {
    if (!rateUpdatedAt) return '';
    const d = new Date(rateUpdatedAt);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 更新`;
  }, [rateUpdatedAt]);

  const canSave =
    label.trim().length > 0 && originalAmount >= 0 && !Number.isNaN(originalAmount);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const trimmedLabel = label.trim();
    const estimatedAmount = currency === 'TWD' ? originalAmount : twdAmount;
    const extraFields: Partial<MonthlyFixedItem> = {
      ...(currency !== 'TWD'
        ? { currency, originalAmount }
        : { currency: undefined, originalAmount: undefined }),
      recurringItemId: isLinked ? recurringItemId : undefined,
    };

    if (isEdit && itemId) {
      const next = monthlyFixedItems.map((x) =>
        x.id === itemId
          ? {
              ...x,
              label: trimmedLabel,
              estimatedAmount,
              categoryKey:
                categoryKey === CATEGORY_NONE ? undefined : categoryKey,
              ...extraFields,
            }
          : x
      );
      await saveMonthlyFixedItems(next);
    } else {
      const newItem: MonthlyFixedItem = {
        id: generateId(),
        label: trimmedLabel,
        estimatedAmount,
        categoryKey:
          categoryKey === CATEGORY_NONE ? undefined : categoryKey,
        sortOrder: monthlyFixedItems.length,
        ...extraFields,
      };
      await saveMonthlyFixedItems([...monthlyFixedItems, newItem]);
    }
    navigation.goBack();
  }, [
    canSave,
    isEdit,
    itemId,
    label,
    currency,
    originalAmount,
    twdAmount,
    categoryKey,
    isLinked,
    recurringItemId,
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
        {recurringItems.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{LABEL_RECURRING_LINK}</Text>
            <TouchableOpacity
              style={styles.selectorBtn}
              onPress={() => setShowRecurringPicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.selectorBtnInner}>
                {isLinked && (
                  <Ionicons name="link" size={16} color="#2563eb" style={{ marginRight: 6 }} />
                )}
                <Text style={[styles.selectorBtnText, !isLinked && styles.selectorBtnPlaceholder]} numberOfLines={1}>
                  {isLinked
                    ? (() => {
                        const rec = recurringItems.find((r) => r.id === recurringItemId);
                        return rec ? `${rec.note ?? '固定支出'}  NT$${rec.amount.toLocaleString()}` : '選擇…';
                      })()
                    : '不連結（手動填寫）'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
            {isLinked && (
              <Text style={styles.linkedHint}>名稱與金額將跟著固定收支自動更新</Text>
            )}
          </View>
        )}

        <Modal
          visible={showRecurringPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRecurringPicker(false)}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowRecurringPicker(false)}
          >
            <TouchableOpacity
              style={styles.pickerContent}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.pickerTitle}>{RECURRING_PICKER_TITLE}</Text>
              <ScrollView style={styles.pickerList}>
                <TouchableOpacity
                  style={[styles.pickerRow, !isLinked && styles.pickerRowSelected]}
                  onPress={() => { setRecurringItemId(RECURRING_NONE); setShowRecurringPicker(false); }}
                >
                  <Text style={[styles.pickerRowText, !isLinked && styles.pickerRowTextSelected]}>
                    不連結（手動填寫）
                  </Text>
                </TouchableOpacity>
                {recurringItems.map((rec) => {
                  const selected = recurringItemId === rec.id;
                  return (
                    <TouchableOpacity
                      key={rec.id}
                      style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                      onPress={() => { setRecurringItemId(rec.id); setShowRecurringPicker(false); }}
                    >
                      <Text style={[styles.pickerRowText, selected && styles.pickerRowTextSelected]} numberOfLines={1}>
                        {rec.note ?? '固定支出'}　NT${rec.amount.toLocaleString()}／月
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={styles.pickerClose} onPress={() => setShowRecurringPicker(false)}>
                <Text style={styles.pickerCloseText}>關閉</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{LABEL_NAME}</Text>
          <TextInput
            style={[styles.input, isLinked && styles.inputDisabled]}
            value={label}
            onChangeText={isLinked ? undefined : setLabel}
            editable={!isLinked}
            placeholder={PLACEHOLDER_NAME}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{LABEL_CURRENCY}</Text>
          <View style={styles.chipRow}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, currency === c && styles.chipSelected]}
                onPress={() => setCurrency(c)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, currency === c && styles.chipTextSelected]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {LABEL_AMOUNT}
            {currency !== 'TWD' ? ` (${currency})` : ' (TWD)'}
          </Text>
          <TextInput
            style={[styles.input, isLinked && styles.inputDisabled]}
            value={amountStr}
            onChangeText={isLinked ? undefined : setAmountStr}
            editable={!isLinked}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
        </View>

        {currency !== 'TWD' && (
          <View style={styles.rateCard}>
            <View style={styles.rateRow}>
              <View style={styles.rateInfo}>
                {currentRate != null ? (
                  <>
                    <Text style={styles.rateText}>
                      1 {currency} ≈ NT${currentRate.toFixed(2)}
                    </Text>
                    {rateUpdatedLabel ? (
                      <Text style={styles.rateUpdated}>{rateUpdatedLabel}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.rateNoData}>尚無匯率資料，請先更新</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleRefreshRate}
                disabled={rateLoading}
                activeOpacity={0.7}
              >
                {rateLoading ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Ionicons name="refresh-outline" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>
            </View>

            {currentRate != null && originalAmount > 0 && (
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>{LABEL_RATE_PREVIEW}</Text>
                <Text style={styles.previewAmount}>
                  ≈ NT${Math.round(twdAmount).toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {!isLinked && (
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
        )}

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
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorBtnText: {
    fontSize: 15,
    color: '#1f2937',
    flex: 1,
  },
  selectorBtnPlaceholder: {
    color: '#9ca3af',
  },
  linkedHint: {
    fontSize: 12,
    color: '#2563eb',
    marginTop: 4,
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  pickerList: {
    maxHeight: 280,
  },
  pickerRow: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerRowSelected: {
    backgroundColor: '#2563eb',
  },
  pickerRowText: {
    fontSize: 15,
    color: '#374151',
  },
  pickerRowTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  pickerClose: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  pickerCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
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
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
  },
  rateCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 14,
    marginBottom: 20,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rateInfo: {
    flex: 1,
  },
  rateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  rateUpdated: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  rateNoData: {
    fontSize: 14,
    color: '#9ca3af',
  },
  refreshBtn: {
    padding: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#bfdbfe',
  },
  previewLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  previewAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
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
