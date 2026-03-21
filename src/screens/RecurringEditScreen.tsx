/**
 * 固定收支新增/編輯頁：表單填寫後儲存並返回列表
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
import type {
  Account,
  RecurringItem,
  RecurringRepeat,
  TransactionType,
} from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredRecurring, saveRecurring, getStoredAccounts } from '../utils/storage';
import { generateId } from '../utils/id';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增固定收支';
const TITLE_EDIT = '編輯固定收支';
const LABEL_TYPE = '類型';
const LABEL_AMOUNT = '金額';
const LABEL_CATEGORY = '類別';
const LABEL_NOTE = '備註（選填）';
const LABEL_ACCOUNT = '帳戶';
const LABEL_REPEAT = '週期';
const LABEL_DAY = '日期';
const BTN_SAVE = '儲存';
const REPEAT_MONTHLY = '每月';
const REPEAT_WEEKLY = '每週';
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const DEFAULT_ACCOUNT_LABEL = '現金';
const MIN_DAY_MONTHLY = 1;
const MAX_DAY_MONTHLY = 28;

type NavProp = NativeStackNavigationProp<MainStackParamList, 'RecurringEdit'>;
type RouteProps = NativeStackScreenProps<MainStackParamList, 'RecurringEdit'>['route'];

export default function RecurringEditScreen(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const recurringId = route.params?.recurringId;

  const { expenseCategories, incomeCategories } = useCategories();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [repeat, setRepeat] = useState<RecurringRepeat>('monthly');
  const [day, setDay] = useState(MIN_DAY_MONTHLY);
  const [loaded, setLoaded] = useState(false);

  const categoryList = type === 'expense' ? expenseCategories : incomeCategories;
  const categoryKeys = categoryList.map((c) => c.key);
  const categoryMap = categoryList.reduce<Record<string, string>>((acc, c) => {
    acc[c.key] = c.label;
    return acc;
  }, {});

  const isEdit = Boolean(recurringId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [recurring, accs] = await Promise.all([
        getStoredRecurring(),
        getStoredAccounts(),
      ]);
      if (cancelled) return;
      setAccounts(accs.filter((a) => a.name.trim() !== ''));
      if (recurringId) {
        const item = recurring.find((r) => r.id === recurringId);
        if (item) {
          setType(item.type);
          setAmountStr(String(item.amount));
          setCategory(item.category);
          setNote(item.note ?? '');
          setAccountId(item.accountId);
          setRepeat(item.repeat);
          setDay(item.day);
        }
      } else {
        setCategory(categoryKeys[0] ?? '');
      }
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [recurringId]);

  useEffect(() => {
    if (loaded && categoryKeys.length > 0 && !categoryKeys.includes(category)) {
      setCategory(categoryKeys[0]);
    }
  }, [loaded, type, categoryKeys, category]);

  const amount = Number(amountStr) || 0;
  const dayValid =
    repeat === 'monthly'
      ? day >= MIN_DAY_MONTHLY && day <= MAX_DAY_MONTHLY
      : day >= 0 && day <= 6;
  const canSave = amount > 0 && categoryKeys.includes(category) && dayValid;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const list = await getStoredRecurring();
    const existing = recurringId ? list.find((r) => r.id === recurringId) : null;
    const payload: RecurringItem = {
      id: existing?.id ?? generateId(),
      type,
      amount,
      category,
      note: note.trim() || undefined,
      accountId: accountId || undefined,
      repeat,
      day,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    let next: RecurringItem[];
    if (existing) {
      next = list.map((r) => (r.id === payload.id ? payload : r));
    } else {
      next = [...list, payload];
    }
    await saveRecurring(next);
    navigation.goBack();
  }, [
    canSave,
    recurringId,
    type,
    amount,
    category,
    note,
    accountId,
    repeat,
    day,
    navigation,
  ]);

  if (!loaded) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? TITLE_EDIT : TITLE_ADD}</Text>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={12}
        >
          <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
            {BTN_SAVE}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>{LABEL_TYPE}</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeTab, type === 'expense' && styles.typeTabActive]}
            onPress={() => setType('expense')}
          >
            <Text style={[styles.typeTabText, type === 'expense' && styles.typeTabTextActive]}>
              支出
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeTab, type === 'income' && styles.typeTabActive]}
            onPress={() => setType('income')}
          >
            <Text style={[styles.typeTabText, type === 'income' && styles.typeTabTextActive]}>
              收入
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>{LABEL_AMOUNT}</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#9ca3af"
          value={amountStr}
          onChangeText={setAmountStr}
          keyboardType="number-pad"
        />

        <Text style={styles.fieldLabel}>{LABEL_CATEGORY}</Text>
        <View style={styles.chipWrap}>
          {categoryKeys.map((key) => {
            const isSelected = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => setCategory(key)}
              >
                <Text
                  style={[styles.chipText, isSelected && styles.chipTextSelected]}
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
            <Text style={styles.fieldLabel}>{LABEL_ACCOUNT}</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                style={[styles.chip, !accountId && styles.chipSelected]}
                onPress={() => setAccountId(undefined)}
              >
                <Text style={[styles.chipText, !accountId && styles.chipTextSelected]}>
                  {DEFAULT_ACCOUNT_LABEL}
                </Text>
              </TouchableOpacity>
              {accounts.map((acc) => {
                const isSelected = accountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <Text
                      style={[styles.chipText, isSelected && styles.chipTextSelected]}
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

        <Text style={styles.fieldLabel}>{LABEL_NOTE}</Text>
        <TextInput
          style={styles.input}
          placeholder="選填"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />

        <Text style={styles.fieldLabel}>{LABEL_REPEAT}</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeTab, repeat === 'monthly' && styles.typeTabActive]}
            onPress={() => {
              setRepeat('monthly');
              setDay(MIN_DAY_MONTHLY);
            }}
          >
            <Text style={[styles.typeTabText, repeat === 'monthly' && styles.typeTabTextActive]}>
              {REPEAT_MONTHLY}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeTab, repeat === 'weekly' && styles.typeTabActive]}
            onPress={() => {
              setRepeat('weekly');
              setDay(0);
            }}
          >
            <Text style={[styles.typeTabText, repeat === 'weekly' && styles.typeTabTextActive]}>
              {REPEAT_WEEKLY}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>
          {LABEL_DAY}
          {repeat === 'monthly'
            ? `（${MIN_DAY_MONTHLY}–${MAX_DAY_MONTHLY} 日）`
            : '（週日–週六）'}
        </Text>
        {repeat === 'monthly' ? (
          <TextInput
            style={styles.input}
            placeholder={`${MIN_DAY_MONTHLY}-${MAX_DAY_MONTHLY}`}
            placeholderTextColor="#9ca3af"
            value={day > 0 ? String(day) : ''}
            onChangeText={(t) =>
              setDay(
                Math.min(
                  MAX_DAY_MONTHLY,
                  Math.max(MIN_DAY_MONTHLY, Number(t) || MIN_DAY_MONTHLY)
                )
              )
            }
            keyboardType="number-pad"
          />
        ) : (
          <View style={styles.chipWrap}>
            {WEEKDAY_LABELS.map((label, i) => {
              const isSelected = day === i;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => setDay(i)}
                >
                  <Text
                    style={[styles.chipText, isSelected && styles.chipTextSelected]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveBtn: {
    paddingVertical: 8,
    paddingLeft: 16,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  saveBtnTextDisabled: {
    color: '#9ca3af',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  typeTabActive: {
    backgroundColor: '#2563eb',
  },
  typeTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  typeTabTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  chipSelected: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#fff',
  },
});
