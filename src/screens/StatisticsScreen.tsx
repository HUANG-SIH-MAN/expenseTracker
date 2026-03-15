/**
 * 統計圖表頁：月/年總收支、支出/收入類別占比圓餅圖
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PieChart } from '../components';
import type { TransactionType } from '../types';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import {
  PERIOD_MONTH,
  PERIOD_YEAR,
  type PeriodKind,
  getPeriodTotals,
  getCategoryBreakdown,
} from '../utils/statistics';
import { getTodayKey } from '../utils/date';
import type { MainStackParamList } from '../navigation/MainStack';

const TITLE = '統計圖表';
const BACK_ICON_SIZE = 28;
const PERIOD_LABEL_MONTH = '月';
const PERIOD_LABEL_YEAR = '年';
const LABEL_INCOME = '總收入';
const LABEL_EXPENSE = '總支出';
const LABEL_BALANCE = '結餘';
const CHART_TYPE_EXPENSE = '支出';
const CHART_TYPE_INCOME = '收入';
const EMPTY_CHART = '當期尚無資料';
const ARROW_PREV = '‹';
const ARROW_NEXT = '›';

const HEADER_TITLE_FONT_SIZE = 22;
const HEADER_PADDING_H = 20;
const HEADER_PADDING_BOTTOM = 16;
const CARD_PADDING = 20;
const CARD_BORDER_RADIUS = 12;
const CARD_MARGIN_BOTTOM = 16;
const SUMMARY_AMOUNT_FONT_SIZE = 28;
const SUMMARY_LABEL_FONT_SIZE = 14;
const PERIOD_BTN_FONT_SIZE = 16;
const PERIOD_ARROW_FONT_SIZE = 24;
const CHART_SIZE = 160;
const LEGEND_ITEM_FONT_SIZE = 13;
const LEGEND_ITEM_HEIGHT = 24;
const LIST_HEADER_FONT_SIZE = 12;
const LIST_ROW_FONT_SIZE = 14;
const LIST_ROW_MIN_HEIGHT = 44;
const COL_RANK_WIDTH = 28;
const COL_CATEGORY_FLEX = 1;
const COL_AMOUNT_WIDTH = 80;
const COL_RATIO_WIDTH = 56;

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

function getYearMonthFromDateKey(dateKey: string): { year: number; month: number } {
  const [y, m] = dateKey.split('-').map(Number);
  return { year: y, month: m };
}

function formatPeriodTitle(period: PeriodKind, year: number, month?: number): string {
  if (period === PERIOD_YEAR) return `${year}年`;
  return `${year}年${month ?? 1}月`;
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

type NavProp = NativeStackNavigationProp<MainStackParamList, 'Statistics'>;

export default function StatisticsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { transactions } = useTransactions();
  const { getCategoryLabel, getCategoryIcon } = useCategories();

  const today = getTodayKey();
  const { year: initialYear, month: initialMonth } = getYearMonthFromDateKey(today);

  const [period, setPeriod] = useState<PeriodKind>(PERIOD_MONTH);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [chartType, setChartType] = useState<TransactionType>('expense');

  const totals = useMemo(
    () =>
      getPeriodTotals(
        transactions,
        period,
        selectedYear,
        period === PERIOD_MONTH ? selectedMonth : undefined
      ),
    [transactions, period, selectedYear, selectedMonth]
  );

  const categorySlices = useMemo(
    () =>
      getCategoryBreakdown(
        transactions,
        period,
        selectedYear,
        chartType,
        period === PERIOD_MONTH ? selectedMonth : undefined
      ),
    [transactions, period, selectedYear, selectedMonth, chartType]
  );

  const pieData = useMemo(() => {
    return categorySlices.map((slice, i) => ({
      name: getCategoryLabel(chartType, slice.category),
      amount: slice.amount,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [categorySlices, chartType, getCategoryLabel]);

  const goPrev = useCallback(() => {
    if (period === PERIOD_MONTH) {
      if (selectedMonth <= 1) {
        setSelectedYear((y) => y - 1);
        setSelectedMonth(12);
      } else {
        setSelectedMonth((m) => m - 1);
      }
    } else {
      setSelectedYear((y) => y - 1);
    }
  }, [period, selectedMonth]);

  const goNext = useCallback(() => {
    if (period === PERIOD_MONTH) {
      if (selectedMonth >= 12) {
        setSelectedYear((y) => y + 1);
        setSelectedMonth(1);
      } else {
        setSelectedMonth((m) => m + 1);
      }
    } else {
      setSelectedYear((y) => y + 1);
    }
  }, [period, selectedMonth]);

  const screenWidth = Dimensions.get('window').width;
  const chartSize = CHART_SIZE;

  const goToCategoryExpenses = useCallback(
    (categoryKey: string) => {
      navigation.navigate('CategoryExpenses', {
        categoryKey,
        transactionType: chartType,
        period,
        year: selectedYear,
        month: period === PERIOD_MONTH ? selectedMonth : undefined,
      });
    },
    [navigation, chartType, period, selectedYear, selectedMonth]
  );

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
        <View style={styles.titleWrap} pointerEvents="box-none">
          <Text style={styles.title}>{TITLE}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 期選擇：月 / 年 */}
        <View style={styles.periodTabs}>
          <TouchableOpacity
            style={[styles.periodTab, period === PERIOD_MONTH && styles.periodTabActive]}
            onPress={() => setPeriod(PERIOD_MONTH)}
          >
            <Text
              style={[
                styles.periodTabText,
                period === PERIOD_MONTH && styles.periodTabTextActive,
              ]}
            >
              {PERIOD_LABEL_MONTH}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodTab, period === PERIOD_YEAR && styles.periodTabActive]}
            onPress={() => setPeriod(PERIOD_YEAR)}
          >
            <Text
              style={[
                styles.periodTabText,
                period === PERIOD_YEAR && styles.periodTabTextActive,
              ]}
            >
              {PERIOD_LABEL_YEAR}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 當期切換：上一期 / 標題 / 下一期 */}
        <View style={styles.periodRow}>
          <TouchableOpacity onPress={goPrev} style={styles.periodArrowBtn} hitSlop={12}>
            <Text style={styles.periodArrowText}>{ARROW_PREV}</Text>
          </TouchableOpacity>
          <Text style={styles.periodTitle}>
            {formatPeriodTitle(period, selectedYear, selectedMonth)}
          </Text>
          <TouchableOpacity onPress={goNext} style={styles.periodArrowBtn} hitSlop={12}>
            <Text style={styles.periodArrowText}>{ARROW_NEXT}</Text>
          </TouchableOpacity>
        </View>

        {/* 總收支區 */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{LABEL_INCOME}</Text>
            <Text style={[styles.summaryAmount, styles.amountIncome]}>
              {formatAmount(totals.totalIncome)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{LABEL_EXPENSE}</Text>
            <Text style={[styles.summaryAmount, styles.amountExpense]}>
              {formatAmount(totals.totalExpense)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowLast]}>
            <Text style={styles.summaryLabel}>{LABEL_BALANCE}</Text>
            <Text
              style={[
                styles.summaryAmount,
                totals.balance >= 0 ? styles.amountIncome : styles.amountExpense,
              ]}
            >
              {formatAmount(totals.balance)}
            </Text>
          </View>
        </View>

        {/* 圖表類型：支出 / 收入 */}
        <View style={styles.chartTypeTabs}>
          <TouchableOpacity
            style={[styles.chartTypeTab, chartType === 'expense' && styles.chartTypeTabActive]}
            onPress={() => setChartType('expense')}
          >
            <Text
              style={[
                styles.chartTypeTabText,
                chartType === 'expense' && styles.chartTypeTabTextActive,
              ]}
            >
              {CHART_TYPE_EXPENSE}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chartTypeTab, chartType === 'income' && styles.chartTypeTabActive]}
            onPress={() => setChartType('income')}
          >
            <Text
              style={[
                styles.chartTypeTabText,
                chartType === 'income' && styles.chartTypeTabTextActive,
              ]}
            >
              {CHART_TYPE_INCOME}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 圓餅圖與圖例（左右並排） */}
        {pieData.length === 0 ? (
          <View style={styles.emptyChartWrap}>
            <Text style={styles.emptyChartText}>{EMPTY_CHART}</Text>
          </View>
        ) : (
          <>
            <View style={styles.chartWithLegendRow}>
              <View style={styles.chartWrap}>
                <PieChart data={pieData} size={chartSize} />
              </View>
              <View style={styles.legend}>
                {categorySlices.map((slice, i) => (
                  <View key={`${slice.category}-${i}`} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] },
                      ]}
                    />
                    <Text style={styles.legendLabel} numberOfLines={1}>
                      {getCategoryLabel(chartType, slice.category)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 類別列表：可點擊進入期間明細 */}
            <View style={styles.listCard}>
              <View style={styles.listHeader}>
                <Text style={[styles.listHeaderCell, styles.colRank]}>#</Text>
                <Text style={[styles.listHeaderCell, styles.colCategory]}>類別</Text>
                <Text style={[styles.listHeaderCell, styles.colAmount]}>金額</Text>
                <Text style={[styles.listHeaderCell, styles.colRatio]}>比例</Text>
              </View>
              {categorySlices.map((slice, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length];
                const isLast = i === categorySlices.length - 1;
                return (
                  <TouchableOpacity
                    key={`row-${slice.category}-${i}`}
                    style={[styles.listRow, isLast && styles.listRowLast]}
                    onPress={() => goToCategoryExpenses(slice.category)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.listCell, styles.colRank]}>{i + 1}</Text>
                    <View style={[styles.listCell, styles.colCategory]}>
                      <Text style={styles.listCategoryIcon}>
                        {getCategoryIcon(chartType, slice.category)}
                      </Text>
                      <Text style={styles.listCategoryLabel} numberOfLines={1}>
                        {getCategoryLabel(chartType, slice.category)}
                      </Text>
                    </View>
                    <Text style={[styles.listCell, styles.colAmount, { color }]}>
                      {formatAmount(slice.amount)}
                    </Text>
                    <Text style={[styles.listCell, styles.colRatio, { color }]}>
                      {slice.percentage.toFixed(1)}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
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
    fontSize: HEADER_TITLE_FONT_SIZE,
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
  periodTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabText: {
    fontSize: PERIOD_BTN_FONT_SIZE,
    color: '#6b7280',
    fontWeight: '500',
  },
  periodTabTextActive: {
    color: '#1f2937',
    fontWeight: '600',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  periodArrowBtn: {
    padding: 8,
  },
  periodArrowText: {
    fontSize: PERIOD_ARROW_FONT_SIZE,
    color: '#2563eb',
    fontWeight: '600',
  },
  periodTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_BORDER_RADIUS,
    padding: CARD_PADDING,
    marginBottom: CARD_MARGIN_BOTTOM,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryRowLast: {
    marginBottom: 0,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  summaryLabel: {
    fontSize: SUMMARY_LABEL_FONT_SIZE,
    color: '#6b7280',
  },
  summaryAmount: {
    fontSize: SUMMARY_AMOUNT_FONT_SIZE,
    fontWeight: '700',
  },
  amountIncome: {
    color: '#059669',
  },
  amountExpense: {
    color: '#dc2626',
  },
  chartTypeTabs: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  chartTypeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  chartTypeTabActive: {
    borderBottomColor: '#2563eb',
  },
  chartTypeTabText: {
    fontSize: PERIOD_BTN_FONT_SIZE,
    color: '#9ca3af',
    fontWeight: '500',
  },
  chartTypeTabTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  chartWithLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  chartWrap: {
    marginRight: 16,
  },
  emptyChartWrap: {
    height: CHART_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChartText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  legend: {
    flexShrink: 0,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LEGEND_ITEM_HEIGHT,
    marginBottom: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    flex: 1,
    fontSize: LEGEND_ITEM_FONT_SIZE,
    color: '#1f2937',
  },
  listCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  listHeaderCell: {
    fontSize: LIST_HEADER_FONT_SIZE,
    color: '#6b7280',
    fontWeight: '600',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LIST_ROW_MIN_HEIGHT,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  listCell: {
    fontSize: LIST_ROW_FONT_SIZE,
    color: '#1f2937',
  },
  colRank: {
    width: COL_RANK_WIDTH,
  },
  colCategory: {
    flex: COL_CATEGORY_FLEX,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colAmount: {
    width: COL_AMOUNT_WIDTH,
    textAlign: 'right',
    fontWeight: '600',
  },
  colRatio: {
    width: COL_RATIO_WIDTH,
    textAlign: 'right',
    fontWeight: '600',
  },
  listCategoryIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  listCategoryLabel: {
    flex: 1,
    fontSize: LIST_ROW_FONT_SIZE,
    color: '#1f2937',
  },
});
