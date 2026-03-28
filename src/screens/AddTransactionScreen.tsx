/**
 * 新增/編輯單筆收入/支出 — 表單 + 底部計算機鍵盤
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account, MonthlyFixedItem, Transaction, TransactionType } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';
import { generateId } from '../utils/id';
import { parseAmountInput } from '../utils/amountExpression';
import { formatDateWithWeekday } from '../utils/date';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useBudget } from '../contexts/BudgetContext';
import { getStoredAccounts, addRecurringSkip } from '../utils/storage';
import { resolveEffectiveDefaultAccountId } from '../utils/categoryDefaultAccount';
import { CalculatorKeypad } from '../components';
import Ionicons from '@expo/vector-icons/Ionicons';

type RouteProps = NativeStackScreenProps<MainStackParamList, 'AddTransaction'>['route'];

/** 鍵盤區佔畫面高度比例（0～1），表單區佔其餘，讓「整頁」都在畫面內 */
const KEYPAD_FLEX_RATIO = 0.42;
const BODY_FLEX_RATIO = 1 - KEYPAD_FLEX_RATIO;
/** 備註欄聚焦、系統鍵盤開啟時，表單區佔滿並隱藏計算機，避免與鍵盤重疊 */
const BODY_FLEX_WHEN_NOTE_FOCUSED = 1;
const KEYPAD_MIN_BOTTOM_PADDING = 8;
/** 頂部表單區塊垂直節奏（取代過小的百分比 margin，減少擁擠感） */
const FORM_GAP_AFTER_TABS = 18;
const FORM_SECTION_GAP = 14;
const AMOUNT_DISPLAY_FONT_SIZE = 24;
const AMOUNT_CURRENCY_SUFFIX_SIZE = 15;
const LABEL_CATEGORY = '類別';
const LABEL_ACCOUNT = '帳戶';
const CHEVRON_FORWARD_SIZE = 18;
const LABEL_BUDGET_LINK = '連接預算（選填）';
const BTN_BUDGET_LINK = '選擇固定收支項目';
const BACK_ICON_SIZE = 28;
const AUTOPAY_READONLY_HINT = '此筆交易為系統自動建立的信用卡自動扣款，僅可檢視，無法編輯或刪除。';

function isLockedCreditCardAutopayTransaction(
  transaction?: Transaction,
): boolean {
  if (!transaction) return false;
  return (
    transaction.systemGeneratedType === 'credit_card_autopay' ||
    transaction.lockedReason === 'credit_card_autopay'
  );
}

export default function AddTransactionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedDate, transactionId } = route.params;
  const { addTransaction, updateTransaction, getTransactionById } = useTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const { monthlyFixedItems } = useBudget();

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
  const [monthlyFixedItemId, setMonthlyFixedItemId] = useState<string | undefined>(undefined);
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const isEditMode = Boolean(transactionId);
  const existing = transactionId ? getTransactionById(transactionId) : undefined;
  const isLockedAutopay = isLockedCreditCardAutopayTransaction(existing);

  const prevCategoryRef = useRef<string | null>(null);
  const prevTypeRef = useRef<TransactionType | null>(null);
  const skipCategoryAccountApplyRef = useRef(false);

  useEffect(() => {
    const keys = type === 'expense'
      ? expenseCategories.map((c) => c.key)
      : incomeCategories.map((c) => c.key);
    const first = keys[0];
    if (first) setCategory((prev) => (keys.includes(prev) ? prev : first));
  }, [type, expenseCategories, incomeCategories]);

  useEffect(() => {
    getStoredAccounts().then((list: Account[]) => {
      const valid = list.filter((a: Account) =>
        a.name.trim() !== '' &&
        !a.isDeleted &&
        (!a.isHidden || a.id === accountId || a.id === existing?.accountId)
      );
      setAccounts(valid);
      if (valid.length > 0 && !transactionId) {
        setAccountId((prev) => prev ?? valid[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  useEffect(() => {
    const pk = route.params.pickedCategoryKey;
    if (pk == null) return;
    const keys =
      type === 'expense'
        ? expenseCategories.map((c) => c.key)
        : incomeCategories.map((c) => c.key);
    if (keys.includes(pk)) setCategory(pk);
    navigation.setParams({ pickedCategoryKey: undefined });
  }, [route.params.pickedCategoryKey, type, expenseCategories, incomeCategories, navigation]);

  useEffect(() => {
    const aid = route.params.pickedAccountId;
    if (aid == null) return;
    setAccountId(aid);
    navigation.setParams({ pickedAccountId: undefined });
  }, [route.params.pickedAccountId, navigation]);

  useEffect(() => {
    const mid = route.params.pickedMonthlyFixedItemId;
    if (mid === undefined) return;
    setMonthlyFixedItemId(mid ?? undefined);
    navigation.setParams({ pickedMonthlyFixedItemId: undefined });
  }, [route.params.pickedMonthlyFixedItemId, navigation]);

  useEffect(() => {
    const aid = route.params.pickedAnnualBudgetEntryId;
    if (aid === undefined) return;
    setAnnualBudgetEntryId(aid ?? undefined);
    navigation.setParams({ pickedAnnualBudgetEntryId: undefined });
  }, [route.params.pickedAnnualBudgetEntryId, navigation]);

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
    setMonthlyFixedItemId(existing.monthlyFixedItemId);
    skipCategoryAccountApplyRef.current = true;
  }, [existing?.id]);

  useEffect(() => {
    if (accounts.length === 0) return;
    const validIds = new Set(accounts.map((a) => a.id));
    if (skipCategoryAccountApplyRef.current) {
      skipCategoryAccountApplyRef.current = false;
      prevCategoryRef.current = category;
      prevTypeRef.current = type;
      return;
    }
    if (prevCategoryRef.current === null) {
      prevCategoryRef.current = category;
      prevTypeRef.current = type;
      return;
    }
    if (prevCategoryRef.current === category && prevTypeRef.current === type) {
      return;
    }
    prevCategoryRef.current = category;
    prevTypeRef.current = type;
    const list = type === 'expense' ? expenseCategories : incomeCategories;
    const item = list.find((c) => c.key === category);
    const resolved = resolveEffectiveDefaultAccountId(item, validIds);
    if (resolved) {
      setAccountId(resolved);
    }
  }, [category, type, expenseCategories, incomeCategories, accounts]);

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
    if (isLockedAutopay) return;
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
        monthlyFixedItemId,
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
        monthlyFixedItemId,
        createdAt: new Date().toISOString(),
      });
    }
    navigation.popToTop();
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountCurrency = selectedAccount?.currency ?? 'TWD';
  const currencyCodeDisplay = accountCurrency.trim().toUpperCase();
  const amountDisplay = amountStr.trim() === '' ? '金額' : amountStr;

  const bodyFlex = isNoteFocused ? BODY_FLEX_WHEN_NOTE_FOCUSED : BODY_FLEX_RATIO;

  if (isEditMode && isLockedAutopay) {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={[
            styles.bodyContent,
            {
              paddingTop: Math.max(16, insets.top),
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.typeRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
            </TouchableOpacity>
            <Text style={styles.readOnlyTitle}>唯讀交易</Text>
            <View style={styles.readOnlyTitleSpacer} />
          </View>
          <View style={styles.readOnlyHintBox}>
            <Text style={styles.readOnlyHintText}>{AUTOPAY_READONLY_HINT}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={[styles.bodyScroll, { flex: bodyFlex }]}
        contentContainerStyle={[
          styles.bodyContent,
          {
            paddingTop: Math.max(16, insets.top),
            paddingBottom: Math.max(12, insets.bottom),
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
            <TouchableOpacity
              style={styles.tab}
              onPress={() => navigation.navigate('AddTransfer', { selectedDate: dateKey })}
            >
              <Text style={styles.tabText}>轉帳</Text>
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

        <View style={[styles.fieldRow, styles.fieldRowFirst]}>
          <Text style={styles.fieldLabel}>日期</Text>
          <Text style={styles.fieldValue}>{formatDateWithWeekday(dateKey)}</Text>
        </View>

        <View style={styles.amountSection}>
          <View style={styles.amountRow}>
            <Text
              style={[styles.amountDisplay, amountError && styles.amountDisplayError]}
              numberOfLines={1}
            >
              {amountDisplay}
            </Text>
            <Text style={styles.amountCurrencySuffix}>{currencyCodeDisplay}</Text>
          </View>
          {amountError ? <Text style={styles.amountError}>{amountError}</Text> : null}
        </View>

        <TouchableOpacity
          style={styles.selectorRow}
          onPress={() =>
            navigation.navigate('SelectTransactionCategory', {
              transactionType: type === 'income' ? 'income' : 'expense',
              selectedKey: category,
              returnDate: dateKey,
              returnTransactionId: transactionId,
              returnToRouteKey: route.key,
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.selectorLabel}>{LABEL_CATEGORY}</Text>
          <View style={styles.selectorRight}>
            <Text style={styles.selectorValue} numberOfLines={1}>
              {categoryMap[category] ?? '—'}
            </Text>
            <Ionicons name="chevron-forward" size={CHEVRON_FORWARD_SIZE} color="#9ca3af" />
          </View>
        </TouchableOpacity>

        {accounts.length > 0 ? (
          <TouchableOpacity
            style={styles.selectorRow}
            onPress={() =>
              navigation.navigate('SelectTransactionAccount', {
                selectedAccountId: accountId,
                returnDate: dateKey,
                returnTransactionId: transactionId,
                returnToRouteKey: route.key,
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.selectorLabel}>{LABEL_ACCOUNT}</Text>
            <View style={styles.selectorRight}>
              <Text style={styles.selectorValue} numberOfLines={1}>
                {selectedAccount?.name?.trim() ? selectedAccount.name : '—'}
              </Text>
              <Ionicons name="chevron-forward" size={CHEVRON_FORWARD_SIZE} color="#9ca3af" />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.selectorRow}
          onPress={() =>
            navigation.navigate('SelectBudgetLink', {
              transactionType: type,
              dateKey,
              currentMonthlyFixedItemId: monthlyFixedItemId,
              currentAnnualBudgetEntryId: annualBudgetEntryId,
              returnDate: dateKey,
              returnTransactionId: transactionId,
            })
          }
          activeOpacity={0.7}
        >
          <Text style={styles.selectorLabel}>{LABEL_BUDGET_LINK}</Text>
          <View style={styles.selectorRight}>
            <Text style={styles.selectorValue} numberOfLines={1}>
              {monthlyFixedItemId
                ? (monthlyFixedItems.find((x) => x.id === monthlyFixedItemId)?.label ?? BTN_BUDGET_LINK)
                : annualBudgetEntryId
                ? '年度項目已連結'
                : BTN_BUDGET_LINK}
            </Text>
            <Ionicons name="chevron-forward" size={CHEVRON_FORWARD_SIZE} color="#9ca3af" />
          </View>
        </TouchableOpacity>

        <View style={styles.noteSection}>
          <Text style={styles.noteSectionLabel}>備註（選填）</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="可輸入備註"
            placeholderTextColor="#9ca3af"
            value={note}
            onChangeText={setNote}
            onFocus={() => setIsNoteFocused(true)}
            onBlur={() => setIsNoteFocused(false)}
          />
        </View>
      </ScrollView>

      {!isNoteFocused ? (
        <View
          style={[
            styles.keypadWrap,
            {
              flex: KEYPAD_FLEX_RATIO,
              paddingBottom: Math.max(insets.bottom, KEYPAD_MIN_BOTTOM_PADDING),
            },
          ]}
        >
          <CalculatorKeypad
            value={amountStr}
            onValueChange={setAmountStr}
            onConfirm={handleSubmit}
          />
        </View>
      ) : null}
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
    marginBottom: FORM_GAP_AFTER_TABS,
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
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: FORM_SECTION_GAP,
  },
  fieldRowFirst: {
    paddingTop: 2,
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
    marginBottom: FORM_SECTION_GAP,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountDisplay: {
    flex: 1,
    minWidth: 0,
    fontSize: AMOUNT_DISPLAY_FONT_SIZE,
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  amountCurrencySuffix: {
    fontSize: AMOUNT_CURRENCY_SUFFIX_SIZE,
    fontWeight: '600',
    color: '#9ca3af',
    letterSpacing: 0.5,
  },
  amountDisplayError: {
    color: '#dc2626',
  },
  amountError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 2,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: FORM_SECTION_GAP,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  selectorLabel: {
    fontSize: 15,
    color: '#6b7280',
    marginRight: 12,
  },
  selectorRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  selectorValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  noteSection: {
    marginTop: 4,
  },
  noteSectionLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  noteInput: {
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 40,
    maxHeight: 72,
  },
  keypadWrap: {
    minHeight: 0,
  },
  readOnlyTitle: {
    fontSize: 17,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  readOnlyTitleSpacer: {
    minWidth: 44,
  },
  readOnlyHintBox: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  readOnlyHintText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
  },
});
