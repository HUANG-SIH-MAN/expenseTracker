/**
 * 類別期間明細：該類別在選定期間內的所有交易
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Transaction, Account } from '../types';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { filterTransactionsByPeriodAndCategory } from '../utils/statistics';
import { formatDateShort } from '../utils/date';
import { getStoredAccounts, getStoredPrimaryCurrency } from '../utils/storage';
import { buildAccountCostBasisMap } from '../utils/balance';
import type { MainStackParamList } from '../navigation/MainStack';

const DEFAULT_ACCOUNT_LABEL = '現金';

const BACK_ICON_SIZE = 28;
const HEADER_PADDING_H = 20;
const HEADER_PADDING_BOTTOM = 16;
const CARD_PADDING = 16;
const CARD_BORDER_RADIUS = 12;
const LIST_ROW_FONT_SIZE = 15;
const TOTAL_LABEL_FONT_SIZE = 14;
const TOTAL_AMOUNT_FONT_SIZE = 24;
const EMPTY_HINT = '此期間內尚無該類別紀錄';

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CategoryExpenses'>;
type CategoryExpensesRouteProp = RouteProp<MainStackParamList, 'CategoryExpenses'>;

export default function CategoryExpensesScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<CategoryExpensesRouteProp>();
  const { categoryKey, transactionType, period, year, month } = route.params;

  const { transactions } = useTransactions();
  const { getCategoryLabel } = useCategories();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('TWD');

  useEffect(() => {
    getStoredAccounts().then(setAccounts);
    getStoredPrimaryCurrency().then(setPrimaryCurrency);
  }, []);

  const costBasisMap = useMemo(
    () => buildAccountCostBasisMap(accounts, transactions, primaryCurrency),
    [accounts, transactions, primaryCurrency]
  );

  const getAccountName = useCallback(
    (accountId?: string): string => {
      if (!accountId) return DEFAULT_ACCOUNT_LABEL;
      const acc = accounts.find((a) => a.id === accountId);
      return acc?.name?.trim() ? acc.name : DEFAULT_ACCOUNT_LABEL;
    },
    [accounts]
  );

  const periodLabel = period === 'year' ? `${year}年` : `${year}年${month ?? 1}月`;
  const categoryLabel = getCategoryLabel(transactionType, categoryKey);

  const list = useMemo(
    () =>
      filterTransactionsByPeriodAndCategory(
        transactions,
        period,
        year,
        transactionType,
        categoryKey,
        period === 'month' ? (month ?? 1) : undefined
      ),
    [transactions, period, year, month, transactionType, categoryKey]
  );

  const sortedList = useMemo(
    () => [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    [list]
  );

  const total = useMemo(() => sortedList.reduce((sum, t) => {
    const rate = transactionType === 'expense' ? (costBasisMap.get(t.accountId ?? '') ?? 1) : 1;
    return sum + t.amount * rate;
  }, 0), [sortedList, transactionType, costBasisMap]);

  const isIncome = transactionType === 'income';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <View style={styles.titleWrap} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>
            {categoryLabel} · {periodLabel}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text
            style={[
              styles.totalAmount,
              isIncome ? styles.amountIncome : styles.amountExpense,
            ]}
          >
            {formatAmount(total)}
          </Text>
        </View>

        {sortedList.length === 0 ? (
          <Text style={styles.emptyText}>{EMPTY_HINT}</Text>
        ) : (
          <View style={styles.listCard}>
            {sortedList.map((item) => {
              const costRate = !isIncome ? costBasisMap.get(item.accountId ?? '') : undefined;
              const twdEquiv = costRate != null ? Math.round(item.amount * costRate) : null;
              return (
              <TouchableOpacity
                key={item.id}
                style={styles.row}
                onPress={() => navigation.navigate('AddTransaction', { selectedDate: item.date, transactionId: item.id })}
                activeOpacity={0.7}
              >
                <Text style={styles.rowDate} numberOfLines={1}>{formatDateShort(item.date)}</Text>
                <Text style={styles.rowMiddle} numberOfLines={1}>
                  {item.note?.trim()
                    ? `${item.note.trim()} | ${getAccountName(item.accountId)}`
                    : getAccountName(item.accountId)}
                </Text>
                <View style={styles.rowAmountCol}>
                  <Text style={[styles.rowAmount, isIncome ? styles.amountIncome : styles.amountExpense]}>
                    {isIncome ? '+' : '-'}{formatAmount(item.amount)}
                  </Text>
                  {twdEquiv != null ? (
                    <Text style={styles.rowCostBasis}>≈ NT${twdEquiv.toLocaleString()}</Text>
                  ) : null}
                </View>
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
    paddingHorizontal: HEADER_PADDING_H,
    paddingVertical: 12,
    paddingBottom: HEADER_PADDING_BOTTOM,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 12,
    zIndex: 1,
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: HEADER_PADDING_H,
    paddingTop: 20,
    paddingBottom: 24,
  },
  totalCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_BORDER_RADIUS,
    padding: CARD_PADDING,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: TOTAL_LABEL_FONT_SIZE,
    color: '#6b7280',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: TOTAL_AMOUNT_FONT_SIZE,
    fontWeight: '700',
  },
  amountIncome: {
    color: '#059669',
  },
  amountExpense: {
    color: '#dc2626',
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 24,
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowDate: {
    width: 72,
    fontSize: LIST_ROW_FONT_SIZE,
    color: '#6b7280',
  },
  rowMiddle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: LIST_ROW_FONT_SIZE,
    color: '#1f2937',
  },
  rowAmountCol: {
    alignItems: 'flex-end',
  },
  rowAmount: {
    fontSize: LIST_ROW_FONT_SIZE,
    fontWeight: '600',
  },
  rowCostBasis: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
});
