/**
 * 主畫面：日曆選日期 + 當日收支列表 + 新增記帳（跳轉至獨立畫面）
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Transaction, Account } from '../types';
import { Calendar } from '../components';
import { useTransactions } from '../contexts/TransactionsContext';
import { getTodayKey } from '../utils/date';
import { getStoredAccounts } from '../utils/storage';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  CATEGORY_ICONS,
} from '../constants';

const MONTH_PREV = '‹';
const MONTH_NEXT = '›';
const EMPTY_DAY = '當天尚無紀錄，點下方按鈕新增一筆';
const BTN_ADD = '新增一筆';
const SUB_LABEL_SELF = '自己';
const DEFAULT_ACCOUNT_LABEL = '現金';
const MENU_ELLIPSIS = '⋯';

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

  const { getTransactionsByDate, transactions } = useTransactions();
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
    const map = t.type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
    return map[t.category] ?? t.category;
  };

  const getCategoryIcon = (category: string): string => {
    return CATEGORY_ICONS[category] ?? '📌';
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

  const renderItem = ({ item }: { item: Transaction }) => (
    <View style={styles.recordRow}>
      <View style={styles.recordLeft}>
        <View style={styles.recordIconWrap}>
          <Text style={styles.recordIcon}>{getCategoryIcon(item.category)}</Text>
          <Text style={styles.recordSubLabel}>{SUB_LABEL_SELF}</Text>
        </View>
        <Text style={styles.recordCategoryName} numberOfLines={1}>
          {getCategoryLabel(item)}
        </Text>
      </View>
      <View style={styles.recordRight}>
        <View style={styles.recordAmountBlock}>
          <Text
            style={[
              styles.recordAmount,
              item.type === 'income' ? styles.recordIncome : styles.recordExpense,
            ]}
          >
            {item.type === 'income' ? '+' : '-'}{formatAmount(item.amount)}
          </Text>
          <Text style={styles.recordAccount}>{getAccountName(item.accountId)}</Text>
        </View>
        <TouchableOpacity
          style={styles.recordMenuBtn}
          onPress={() => handleEditTransaction(item)}
          hitSlop={8}
        >
          <Text style={styles.recordMenuText}>{MENU_ELLIPSIS}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
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

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddTransaction', { selectedDate })}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>
      </ScrollView>
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
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  recordLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
  },
  recordIcon: {
    fontSize: 22,
  },
  recordSubLabel: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  recordCategoryName: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
  },
  recordRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordMenuBtn: {
    padding: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  recordMenuText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
  },
  recordAmountBlock: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  recordAmount: {
    fontSize: 17,
    fontWeight: '600',
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
  addBtn: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
