/**
 * 主畫面：日曆選日期 + 當日收支列表 + 新增記帳（跳轉至獨立畫面）
 */
import React, { useState, useMemo } from 'react';
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
import type { Transaction } from '../types';
import { Calendar } from '../components';
import { useTransactions } from '../contexts/TransactionsContext';
import { formatDateShort, getTodayKey } from '../utils/date';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';

const MONTH_PREV = '‹';
const MONTH_NEXT = '›';
const SECTION_DAY = '當日紀錄';
const EMPTY_DAY = '當天尚無紀錄，點下方按鈕新增一筆';
const BTN_ADD = '新增一筆';

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

  const { getTransactionsByDate } = useTransactions();
  const dayTransactions = useMemo(() => {
    const list = getTransactionsByDate(selectedDate);
    return [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [selectedDate, getTransactionsByDate]);

  const { year, month } = useMemo(
    () => getYearMonthFromDateKey(selectedDate),
    [selectedDate]
  );

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

  const renderItem = ({ item }: { item: Transaction }) => (
    <View style={styles.recordRow}>
      <View style={styles.recordLeft}>
        <Text style={[styles.recordAmount, item.type === 'income' ? styles.recordIncome : styles.recordExpense]}>
          {item.type === 'income' ? '+' : '-'}{item.amount}
        </Text>
        <Text style={styles.recordCategory}>{getCategoryLabel(item)}</Text>
        {item.note ? <Text style={styles.recordNote} numberOfLines={1}>{item.note}</Text> : null}
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
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{SECTION_DAY} — {formatDateShort(selectedDate)}</Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  recordLeft: {
    flex: 1,
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
  recordCategory: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  recordNote: {
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
