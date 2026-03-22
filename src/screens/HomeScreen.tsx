/**
 * 主畫面：日曆選日期 + 當日收支列表 + 新增記帳（跳轉至獨立畫面）
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Transaction, Account } from '../types';
import { Calendar } from '../components';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { useBudget } from '../contexts/BudgetContext';
import { getTodayKey } from '../utils/date';
import { getStoredAccounts } from '../utils/storage';
import { getBudgetSummary } from '../utils/budget';
import type { MainStackParamList } from '../navigation/MainStack';

const MONTH_PREV = '‹';
const MONTH_NEXT = '›';
const EMPTY_DAY = '當天尚無紀錄，點下方按鈕新增一筆';
const BTN_ADD = '新增一筆';
const DEFAULT_ACCOUNT_LABEL = '現金';
/** 備註與類別同欄、單行向右延伸，過長以省略顯示 */
const RECORD_NOTE_MAX_LINES = 1;
/** 編輯／刪除圖示字級（視覺縮小；觸控範圍靠 hitSlop） */
const RECORD_ROW_ACTION_ICON_SIZE = 16;
const RECORD_ACTIONS_GAP = 4;
const RECORD_ACTION_BTN_PADDING = 2;
const RECORD_ACTION_HIT_SLOP = 10;
const BOTTOM_LEDGER = '帳本';
const BOTTOM_STATS = '統計';
const BOTTOM_ADD_LABEL = '記一筆';
const BOTTOM_BUDGET = '預算';
const BOTTOM_SETTINGS = '設定';
const BOTTOM_BAR_HEIGHT = 56;
const BOTTOM_ICON_SIZE = 24;
const BOTTOM_LABEL_FONT_SIZE = 11;
const BUDGET_CARD_TITLE = '本月預算';
const BUDGET_REMAINING = '剩餘可支配';
const BUDGET_TODAY_SUGGESTED = '今日建議';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'Home'>;

function getYearMonthFromDateKey(dateKey: string): { year: number; month: number } {
  const [y, m] = dateKey.split('-').map(Number);
  return { year: y, month: m };
}

function formatYearMonthHeader(year: number, month: number): string {
  return `${year}年${month}月`;
}

export default function HomeScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const today = getTodayKey();
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const { getTransactionsByDate, transactions, refreshTransactions, deleteTransaction } = useTransactions();
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] = useState<Transaction | null>(null);
  useFocusEffect(
    useCallback(() => {
      refreshTransactions();
    }, [refreshTransactions])
  );
  const { getCategoryLabel: getCategoryLabelFromContext, getCategoryIcon: getCategoryIconFromContext } = useCategories();
  const { monthlyFixedItems, budgetSettings } = useBudget();
  const budgetSummary = useMemo(() => {
    return getBudgetSummary(today, transactions, monthlyFixedItems, budgetSettings);
  }, [today, transactions, monthlyFixedItems, budgetSettings]);
  const { year, month } = useMemo(
    () => getYearMonthFromDateKey(selectedDate),
    [selectedDate]
  );
  const datesWithRecords = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const [y, m] = t.date.split('-').map(Number);
      if (y === year && m === month) set.add(t.date);
    }
    return set;
  }, [transactions, year, month]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    getStoredAccounts().then(setAccounts);
  }, []);

  const dayTransactions = useMemo(() => {
    const list = getTransactionsByDate(selectedDate);
    return [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [selectedDate, getTransactionsByDate]);

  const { dailyIncomeTotal, dailyExpenseTotal } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of dayTransactions) {
      if (t.type === 'transfer') continue;
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    }
    return { dailyIncomeTotal: income, dailyExpenseTotal: expense };
  }, [dayTransactions]);

  const getAccountName = (accountId?: string): string => {
    if (!accountId) return DEFAULT_ACCOUNT_LABEL;
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.name?.trim() ? acc.name : DEFAULT_ACCOUNT_LABEL;
  };

  const goPrevMonth = () => {
    const d = new Date(year, month - 1, 0);
    const prevMonth = d.getMonth() + 1;
    const prevYear = d.getFullYear();
    const lastDay = d.getDate();
    const newKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    setSelectedDate(newKey);
  };

  const goNextMonth = () => {
    const firstDayNext = new Date(year, month, 1);
    const nextKey = `${firstDayNext.getFullYear()}-${String(firstDayNext.getMonth() + 1).padStart(2, '0')}-01`;
    setSelectedDate(nextKey);
  };

  const getCategoryLabel = (t: Transaction): string => {
    if (t.type === 'transfer') return '轉帳';
    return getCategoryLabelFromContext(t.type, t.category);
  };

  const getCategoryIcon = (t: Transaction): string => {
    if (t.type === 'transfer') return '🔄';
    return getCategoryIconFromContext(t.type, t.category);
  };

  const formatAmount = (n: number): string => {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  };

  const handleEditTransaction = (item: Transaction) => {
    navigation.navigate('AddTransaction', {
      selectedDate: item.date,
      transactionId: item.id,
    });
  };

  const askDeleteTransaction = (item: Transaction) => {
    setConfirmDeleteTransaction(item);
  };

  const cancelDeleteTransaction = () => {
    setConfirmDeleteTransaction(null);
  };

  const confirmDeleteTransactionAction = useCallback(async () => {
    const item = confirmDeleteTransaction;
    if (!item) return;
    await deleteTransaction(item.id);
    setConfirmDeleteTransaction(null);
  }, [confirmDeleteTransaction, deleteTransaction]);

  const renderItem = ({ item }: { item: Transaction }) => {
    const noteLine = item.note?.trim() ?? '';
    return (
    <View style={styles.recordRow}>
      <View style={styles.recordLeft}>
        <View style={styles.recordIconColumn}>
          <Text style={styles.recordIcon}>{getCategoryIcon(item)}</Text>
        </View>
        <View style={styles.recordMainText}>
          <Text style={styles.recordCategoryName} numberOfLines={1}>
            {getCategoryLabel(item)}
          </Text>
          {noteLine.length > 0 ? (
            <Text
              style={styles.recordNoteLine}
              numberOfLines={RECORD_NOTE_MAX_LINES}
              ellipsizeMode="tail"
            >
              {noteLine}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.recordRight}>
        <View style={styles.recordAmountBlock}>
          <Text
            style={[
              styles.recordAmount,
              item.type === 'income'
                ? styles.recordIncome
                : item.type === 'transfer'
                  ? styles.recordTransfer
                  : styles.recordExpense,
            ]}
          >
            {item.type === 'transfer'
              ? `→ ${formatAmount(item.amount)} → ${formatAmount(item.transferAmount ?? 0)}`
              : item.type === 'income'
                ? `+${formatAmount(item.amount)}`
                : `-${formatAmount(item.amount)}`}
          </Text>
          <Text style={styles.recordAccount}>
            {item.type === 'transfer'
              ? `${getAccountName(item.accountId)} → ${getAccountName(item.toAccountId)}`
              : getAccountName(item.accountId)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.recordMenuBtn}
          onPress={() =>
            item.type === 'transfer'
              ? navigation.navigate('AddTransfer', { selectedDate: item.date })
              : handleEditTransaction(item)
          }
          hitSlop={RECORD_ACTION_HIT_SLOP}
          accessibilityLabel="編輯"
        >
          <Ionicons
            name="ellipsis-vertical"
            size={RECORD_ROW_ACTION_ICON_SIZE}
            color="#6b7280"
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.recordDeleteBtn}
          onPress={() => askDeleteTransaction(item)}
          hitSlop={RECORD_ACTION_HIT_SLOP}
        >
          <Ionicons
            name="trash-outline"
            size={RECORD_ROW_ACTION_ICON_SIZE}
            color="#dc2626"
          />
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  const bottomBarPadding = BOTTOM_BAR_HEIGHT + insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomBarPadding + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={goPrevMonth} style={styles.monthBtn} hitSlop={12}>
            <Text style={styles.monthBtnText}>{MONTH_PREV}</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{formatYearMonthHeader(year, month)}</Text>
          <TouchableOpacity onPress={goNextMonth} style={styles.monthBtn} hitSlop={12}>
            <Text style={styles.monthBtnText}>{MONTH_NEXT}</Text>
          </TouchableOpacity>
        </View>

        {budgetSummary != null && (
          <TouchableOpacity
            style={styles.budgetCard}
            onPress={() => navigation.navigate('BudgetSettings')}
            activeOpacity={0.8}
          >
            <Text style={styles.budgetCardTitle}>{BUDGET_CARD_TITLE}</Text>
            <View style={styles.budgetCardRow}>
              <Text style={styles.budgetCardLabel}>{BUDGET_REMAINING}</Text>
              <Text style={styles.budgetCardAmount}>
                {Math.round(budgetSummary.remainingDisposable)}
              </Text>
            </View>
            <View style={styles.budgetCardRow}>
              <Text style={styles.budgetCardLabel}>{BUDGET_TODAY_SUGGESTED}</Text>
              <Text style={styles.budgetCardAmount}>
                {Math.round(budgetSummary.todaySuggestedBudget)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <Calendar
          year={year}
          month={month}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          datesWithRecords={datesWithRecords}
        />

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleLabel}>收入 </Text>
            <Text style={[styles.sectionTitleAmount, styles.sectionTitleIncome]}>
              {formatAmount(dailyIncomeTotal)}
            </Text>
            <Text style={styles.sectionTitleLabel}>  支出 </Text>
            <Text style={[styles.sectionTitleAmount, styles.sectionTitleExpense]}>
              {formatAmount(dailyExpenseTotal)}
            </Text>
          </View>
          {dayTransactions.length === 0 ? (
            <Text style={styles.emptyText}>{EMPTY_DAY}</Text>
          ) : (
            <FlatList
              data={dayTransactions}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom, minHeight: bottomBarPadding },
        ]}
      >
        <TouchableOpacity
          style={styles.bottomBarItem}
          onPress={() => navigation.navigate('LedgerBalance')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="book-outline"
            size={BOTTOM_ICON_SIZE}
            color="#6b7280"
          />
          <Text style={styles.bottomBarLabel}>{BOTTOM_LEDGER}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarItem}
          onPress={() => navigation.navigate('Statistics')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="stats-chart-outline"
            size={BOTTOM_ICON_SIZE}
            color="#6b7280"
          />
          <Text style={styles.bottomBarLabel}>{BOTTOM_STATS}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBarItem, styles.bottomBarCenter]}
          onPress={() => navigation.navigate('AddTransaction', { selectedDate })}
          activeOpacity={0.8}
        >
          <View style={styles.bottomBarCenterIconWrap}>
            <Ionicons
              name="add"
              size={BOTTOM_ICON_SIZE + 4}
              color="#fff"
            />
          </View>
          <Text style={styles.bottomBarCenterLabel}>{BOTTOM_ADD_LABEL}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarItem}
          onPress={() => navigation.navigate('BudgetSettings')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="wallet-outline"
            size={BOTTOM_ICON_SIZE}
            color="#6b7280"
          />
          <Text style={styles.bottomBarLabel}>{BOTTOM_BUDGET}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBarItem}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="settings-outline"
            size={BOTTOM_ICON_SIZE}
            color="#6b7280"
          />
          <Text style={styles.bottomBarLabel}>{BOTTOM_SETTINGS}</Text>
        </TouchableOpacity>
      </View>

      {confirmDeleteTransaction != null ? (
        <View
          style={[
            styles.confirmBar,
            {
              paddingBottom: insets.bottom + 12,
              bottom: bottomBarPadding,
            },
          ]}
        >
          <Text style={styles.confirmText} numberOfLines={2}>
            確定要刪除此筆紀錄？「{getCategoryLabel(confirmDeleteTransaction)}{confirmDeleteTransaction.type === 'transfer' ? '' : confirmDeleteTransaction.type === 'income' ? ' +' : ' -'}
            {confirmDeleteTransaction.type === 'transfer' ? `轉出 ${formatAmount(confirmDeleteTransaction.amount)} / 轉入 ${formatAmount(confirmDeleteTransaction.transferAmount ?? 0)}` : formatAmount(confirmDeleteTransaction.amount)}」
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={styles.confirmCancelBtn}
              onPress={cancelDeleteTransaction}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmDeleteBtn}
              onPress={confirmDeleteTransactionAction}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmDeleteText}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthBtn: {
    padding: 8,
  },
  monthBtnText: {
    fontSize: 24,
    color: '#2563eb',
    fontWeight: '600',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  budgetCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  budgetCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  budgetCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  budgetCardLabel: {
    fontSize: 13,
    color: '#374151',
  },
  budgetCardAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: BOTTOM_BAR_HEIGHT,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  bottomBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  bottomBarLabel: {
    fontSize: BOTTOM_LABEL_FONT_SIZE,
    color: '#6b7280',
    fontWeight: '500',
  },
  bottomBarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarCenterIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarCenterLabel: {
    fontSize: BOTTOM_LABEL_FONT_SIZE,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  sectionTitleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  sectionTitleAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitleIncome: {
    color: '#059669',
  },
  sectionTitleExpense: {
    color: '#dc2626',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  recordLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minWidth: 0,
  },
  recordIconColumn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  recordIcon: {
    fontSize: 22,
  },
  recordMainText: {
    flex: 1,
    minWidth: 0,
  },
  recordCategoryName: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
  },
  recordNoteLine: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 3,
  },
  recordRight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: RECORD_ACTIONS_GAP,
    paddingTop: 1,
  },
  recordMenuBtn: {
    padding: RECORD_ACTION_BTN_PADDING,
    minWidth: RECORD_ROW_ACTION_ICON_SIZE + RECORD_ACTION_BTN_PADDING * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDeleteBtn: {
    padding: RECORD_ACTION_BTN_PADDING,
    minWidth: RECORD_ROW_ACTION_ICON_SIZE + RECORD_ACTION_BTN_PADDING * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  recordAmount: {
    fontSize: 17,
    fontWeight: '600',
  },
  recordTransfer: {
    color: '#6b7280',
  },
  recordIncome: {
    color: '#059669',
  },
  recordExpense: {
    color: '#dc2626',
  },
  recordAccount: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  confirmBar: {
    position: 'absolute',
    left: 0,
    right: 0,
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
