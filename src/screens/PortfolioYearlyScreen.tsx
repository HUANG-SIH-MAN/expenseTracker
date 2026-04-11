/**
 * 年度績效總覽
 * 顯示投資組合每一年的投入金額、損益、報酬率、期末市值
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment } from '../contexts/InvestmentContext';
import { calcPortfolioYearlyReturns, YearlyReturn } from '../utils/stockCalculations';
import { fetchYearEndPriceTWD } from '../utils/stockPrice';

function formatTWD(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}
function formatPct(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}
function gainColor(n: number): string {
  return n >= 0 ? '#16a34a' : '#dc2626';
}

export default function PortfolioYearlyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { transactions, prices, usdTwdRate } = useInvestment();

  const [loading, setLoading] = useState(true);
  const [yearlyData, setYearlyData] = useState<YearlyReturn[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    calcPortfolioYearlyReturns(
      transactions,
      prices,
      usdTwdRate,
      fetchYearEndPriceTWD,
    ).then(data => {
      if (!cancelled) {
        setYearlyData([...data].reverse()); // 最新年份排最前
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [transactions, prices, usdTwdRate]);

  // 累計統計
  const totalInvested = yearlyData.reduce((s, r) => s + r.investedTWD, 0);
  const totalGain = yearlyData.reduce((s, r) => s + r.gainTWD, 0);
  const latestValue = yearlyData.length > 0 ? yearlyData[0].endValueTWD : 0;
  const overallReturn = totalInvested > 0 ? totalGain / totalInvested : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>年度績效總覽</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>載入歷史價格中…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {/* 累計總覽卡片 */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>累計績效</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>目前市值</Text>
                <Text style={styles.summaryValue}>NT$ {formatTWD(latestValue)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>總投入</Text>
                <Text style={styles.summaryValue}>NT$ {formatTWD(totalInvested)}</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>總損益</Text>
                <Text style={[styles.summaryValue, { color: gainColor(totalGain) }]}>
                  {totalGain >= 0 ? '+' : ''}NT$ {formatTWD(totalGain)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>整體報酬率</Text>
                <Text style={[styles.summaryValue, { color: gainColor(overallReturn) }]}>
                  {formatPct(overallReturn)}
                </Text>
              </View>
            </View>
          </View>

          {/* 各年度卡片 */}
          {yearlyData.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bar-chart-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>尚無足夠資料</Text>
            </View>
          ) : (
            yearlyData.map(row => (
              <View key={row.year} style={styles.yearCard}>
                <Text style={styles.yearLabel}>{row.year}</Text>
                <View style={styles.yearRow}>
                  <View style={styles.yearItem}>
                    <Text style={styles.yearSubLabel}>投入金額</Text>
                    <Text style={styles.yearSubValue}>
                      NT$ {formatTWD(row.investedTWD)}
                    </Text>
                  </View>
                  <View style={styles.yearItem}>
                    <Text style={styles.yearSubLabel}>損益</Text>
                    <Text style={[styles.yearSubValue, { color: gainColor(row.gainTWD) }]}>
                      {row.gainTWD >= 0 ? '+' : ''}NT$ {formatTWD(row.gainTWD)}
                    </Text>
                  </View>
                </View>
                <View style={styles.yearRow}>
                  <View style={styles.yearItem}>
                    <Text style={styles.yearSubLabel}>報酬率</Text>
                    <Text style={[styles.yearSubValue, { color: gainColor(row.returnRate) }]}>
                      {formatPct(row.returnRate)}
                    </Text>
                  </View>
                  <View style={styles.yearItem}>
                    <Text style={styles.yearSubLabel}>期末市值</Text>
                    <Text style={styles.yearSubValue}>NT$ {formatTWD(row.endValueTWD)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6b7280' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { padding: 16, gap: 12 },
  summaryCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  summaryTitle: { fontSize: 13, color: '#93c5fd', fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 11, color: '#93c5fd', marginBottom: 2 },
  summaryValue: { fontSize: 15, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', fontWeight: '500' },
  yearCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  yearLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  yearRow: { flexDirection: 'row', gap: 8 },
  yearItem: { flex: 1 },
  yearSubLabel: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  yearSubValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
});
