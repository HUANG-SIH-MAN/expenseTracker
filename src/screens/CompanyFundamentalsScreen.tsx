/**
 * 公司基本面頁面
 * 從「實際曝險分析」點入，顯示個別公司的財務與基本面資料。
 * 資料來源：Alpha Vantage OVERVIEW + INCOME_STATEMENT（3 天快取）
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getStockFundamentals, refreshStockFundamentals } from '../utils/stockFundamentals';
import { classifyInstrument } from '../utils/instrumentClassification';
import type { MainStackParamList } from '../navigation/MainStack';
import type { StockFundamentals } from '../types';

type Route = RouteProp<MainStackParamList, 'CompanyFundamentals'>;

function fmtMarketCap(n: number, currencySymbol: string): string {
  if (n <= 0) return '—';
  if (n >= 1e12) return `${currencySymbol}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${currencySymbol}${(n / 1e9).toFixed(2)}B`;
  return `${currencySymbol}${(n / 1e6).toFixed(0)}M`;
}

function fmtBillions(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${n}`;
}

function FundamentalItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fundamentalItem}>
      <Text style={styles.fundamentalLabel}>{label}</Text>
      <Text style={styles.fundamentalValue}>{value}</Text>
    </View>
  );
}

export default function CompanyFundamentalsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { companyName, stockTicker } = route.params;
  const classification = classifyInstrument({ ticker: stockTicker });
  const currencySymbol = classification.market === 'TW' ? 'NT$' : '$';

  const [fundamentals, setFundamentals] = useState<StockFundamentals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getStockFundamentals(stockTicker)
      .then(data => setFundamentals(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '無法載入基本面資料'))
      .finally(() => setLoading(false));
  }, [stockTicker]);

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await refreshStockFundamentals(stockTicker);
      setFundamentals(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTicker}>{stockTicker}</Text>
          <Text style={styles.headerName} numberOfLines={1}>{companyName}</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={handleRefresh} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color="#2563eb" />
            : <Ionicons name="refresh" size={22} color="#2563eb" />}
        </TouchableOpacity>
      </View>

      {loading && !fundamentals ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>載入基本面資料中…</Text>
        </View>
      ) : error && !fundamentals ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#d1d5db" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryText}>重試</Text>
          </TouchableOpacity>
        </View>
      ) : fundamentals ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {/* 更新時間 */}
          <Text style={styles.timestamp}>
            更新時間：{new Date(fundamentals.lastUpdated).toLocaleDateString('zh-TW')}
            {error && `　⚠️ ${error}`}
          </Text>

          {/* 基本面指標 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>基本面指標</Text>
            <View style={styles.grid}>
              <FundamentalItem label="市值" value={fmtMarketCap(fundamentals.marketCap, currencySymbol)} />
              <FundamentalItem
                label="本益比 P/E"
                value={fundamentals.peRatio != null ? `${fundamentals.peRatio.toFixed(2)}x` : '—'}
              />
              <FundamentalItem
                label="EPS"
                value={fundamentals.eps != null ? `${currencySymbol}${fundamentals.eps.toFixed(2)}` : '—'}
              />
              <FundamentalItem label="52W 最高" value={`${currencySymbol}${fundamentals.week52High.toFixed(2)}`} />
              <FundamentalItem label="52W 最低" value={`${currencySymbol}${fundamentals.week52Low.toFixed(2)}`} />
              <FundamentalItem
                label="Beta"
                value={fundamentals.beta != null ? fundamentals.beta.toFixed(2) : '—'}
              />
            </View>
          </View>

          {/* 年度營收（最近 5 年） */}
          {fundamentals.annualFinancials.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>年度財務（最近 5 年）</Text>
              {/* 表頭 */}
              <View style={styles.tableHeader}>
                <Text style={[styles.cell, styles.yearCell, styles.colLabel]}>年度</Text>
                <Text style={[styles.cell, styles.numCell, styles.colLabel]}>總營收</Text>
                <Text style={[styles.cell, styles.numCell, styles.colLabel]}>毛利</Text>
                <Text style={[styles.cell, styles.numCell, styles.colLabel]}>淨利</Text>
              </View>
              {fundamentals.annualFinancials.map(row => (
                <View key={row.fiscalYear} style={styles.tableRow}>
                  <Text style={[styles.cell, styles.yearCell]}>{row.fiscalYear.slice(0, 4)}</Text>
                  <Text style={[styles.cell, styles.numCell]}>{fmtBillions(row.totalRevenue)}</Text>
                  <Text style={[styles.cell, styles.numCell]}>{fmtBillions(row.grossProfit)}</Text>
                  <Text style={[styles.cell, styles.numCell, { color: row.netIncome >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {fmtBillions(row.netIncome)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTicker: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerName: { fontSize: 12, color: '#6b7280' },
  loadingText: { fontSize: 14, color: '#6b7280' },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  retryText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  scroll: { padding: 16, gap: 16 },
  timestamp: { fontSize: 11, color: '#9ca3af', textAlign: 'right' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fundamentalItem: {
    width: '47%',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  fundamentalLabel: { fontSize: 11, color: '#9ca3af' },
  fundamentalValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  cell: { fontSize: 13, color: '#374151' },
  yearCell: { width: 44, fontWeight: '600' },
  numCell: { flex: 1, textAlign: 'right' },
  colLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
});
