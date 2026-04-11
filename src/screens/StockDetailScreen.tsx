/**
 * 個股詳情頁
 * - 持倉摘要（股數、平均成本、現價、市值、損益）
 * - XIRR 年化報酬率
 * - 各年度報酬率
 * - 歷史買賣紀錄列表
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment, getPriceTWD } from '../contexts/InvestmentContext';
import {
  calcUnrealizedGain,
  buildXIRRCashFlows,
  calcXIRR,
  calcYearlyReturns,
} from '../utils/stockCalculations';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'StockDetail'>;

function fmtTWD(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}

export default function StockDetailScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { ticker } = route.params;
  const {
    transactions,
    positions,
    prices,
    usdTwdRate,
    removeTransaction,
    refreshPrices,
    isRefreshingPrices,
  } = useInvestment();

  const pos = positions.get(ticker);
  const txList = useMemo(
    () => transactions.filter(t => t.ticker === ticker).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, ticker]
  );

  const priceTWD = getPriceTWD(ticker, prices, usdTwdRate);
  const valueTWD = pos ? pos.shares * priceTWD : 0;
  const { gainTWD, gainPct } = pos ? calcUnrealizedGain(pos, priceTWD) : { gainTWD: 0, gainPct: 0 };
  const gainColor = gainTWD >= 0 ? '#16a34a' : '#dc2626';

  // XIRR
  const xirr = useMemo(() => {
    if (!pos || pos.shares <= 0 || valueTWD === 0) return null;
    const sortedTx = [...txList].sort((a, b) => a.date.localeCompare(b.date));
    const { cashFlows, dates } = buildXIRRCashFlows(sortedTx, valueTWD);
    try {
      return calcXIRR(cashFlows, dates);
    } catch {
      return null;
    }
  }, [txList, pos, valueTWD]);

  // 各年報酬率
  const yearlyReturns = useMemo(() => {
    if (txList.length === 0) return [];
    const sortedTx = [...txList].sort((a, b) => a.date.localeCompare(b.date));
    // 只用當前股價作為「目前」的參考；年底價格在此不可知，先略過
    return calcYearlyReturns(sortedTx, {}, priceTWD);
  }, [txList, priceTWD]);

  const [showAll, setShowAll] = useState(false);
  const displayTx = showAll ? txList : txList.slice(0, 10);

  async function handleDelete(id: string, date: string, shares: number) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`確定要刪除 ${date} 的 ${shares} 股紀錄嗎？`)
      : await new Promise<boolean>(resolve =>
          Alert.alert(
            '刪除交易',
            `確定要刪除 ${date} 的 ${shares} 股紀錄嗎？`,
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              { text: '刪除', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        );
    if (!confirmed) return;
    await removeTransaction(id);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTicker}>{ticker}</Text>
          <Text style={styles.headerName}>{pos?.name ?? ticker}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={async () => {
              await refreshPrices(true);
            }}
            disabled={isRefreshingPrices}
          >
            {isRefreshingPrices ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="refresh" size={22} color="#2563eb" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('AddStockTransaction', { ticker })}
          >
            <Ionicons name="add" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {/* 持倉摘要 */}
        {pos && pos.shares > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>持有股數</Text>
                <Text style={styles.summaryVal}>
                  {pos.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>平均成本（原幣）</Text>
                <Text style={styles.summaryVal}>
                  {pos.currency === 'USD' ? '$' : 'NT$'}{pos.avgCostNative.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>當前市值（台幣）</Text>
                <Text style={styles.summaryVal}>NT$ {fmtTWD(valueTWD)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>未實現損益</Text>
                <Text style={[styles.summaryVal, { color: gainColor }]}>
                  {gainTWD >= 0 ? '+' : ''}NT$ {fmtTWD(gainTWD)}
                  {'\n'}{fmtPct(gainPct)}
                </Text>
              </View>
            </View>
            {pos.realizedGainTWD !== 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>已實現損益</Text>
                  <Text style={[styles.summaryVal, { color: pos.realizedGainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {pos.realizedGainTWD >= 0 ? '+' : ''}NT$ {fmtTWD(pos.realizedGainTWD)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* 年化報酬率 */}
        {xirr != null && (
          <View style={styles.xirrCard}>
            <Text style={styles.sectionTitle}>年化報酬率（XIRR）</Text>
            <Text style={[styles.xirrValue, { color: xirr >= 0 ? '#16a34a' : '#dc2626' }]}>
              {fmtPct(xirr)}
            </Text>
            <Text style={styles.xirrHint}>考量每次投入時間點，最能反映實際投資績效</Text>
          </View>
        )}

        {/* 各年報酬率 */}
        {yearlyReturns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>各年度損益</Text>
            {yearlyReturns.map(yr => (
              <View key={yr.year} style={styles.yearRow}>
                <Text style={styles.yearLabel}>{yr.year}</Text>
                <Text style={styles.yearInvested}>投入 NT$ {fmtTWD(yr.investedTWD)}</Text>
                <Text style={[styles.yearReturn, { color: yr.gainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {yr.gainTWD >= 0 ? '+' : ''}NT$ {fmtTWD(yr.gainTWD)}
                </Text>
                <Text style={[styles.yearPct, { color: yr.returnRate >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {fmtPct(yr.returnRate)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 歷史交易紀錄 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>交易紀錄</Text>
          {txList.length === 0 && (
            <Text style={styles.emptyText}>尚無交易紀錄</Text>
          )}
          {displayTx.map(tx => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <View style={[styles.txBadge, tx.type === 'buy' ? styles.badgeBuy : styles.badgeSell]}>
                  <Text style={styles.txBadgeText}>{tx.type === 'buy' ? '買入' : '賣出'}</Text>
                </View>
                <View>
                  <Text style={styles.txDate}>{tx.date}</Text>
                  <Text style={styles.txMeta}>
                    {tx.shares.toLocaleString()} 股 ．
                    {pos?.currency === 'USD' ? `$${tx.priceNative.toFixed(2)}` : `NT$${tx.priceNative.toFixed(0)}`}
                  </Text>
                </View>
              </View>
              <View style={styles.txRight}>
                <Text style={styles.txCost}>NT$ {fmtTWD(tx.twdCost)}</Text>
                {tx.usdCost != null && (
                  <Text style={styles.txCostSub}>${tx.usdCost.toFixed(2)}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => navigation.navigate('AddStockTransaction', { transaction: tx })}>
                    <Ionicons name="pencil-outline" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(tx.id, tx.date, tx.shares)}>
                    <Ionicons name="trash-outline" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
          {txList.length > 10 && !showAll && (
            <TouchableOpacity style={styles.showMore} onPress={() => setShowAll(true)}>
              <Text style={styles.showMoreText}>顯示全部 {txList.length} 筆</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTicker: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerName: { fontSize: 12, color: '#6b7280' },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerBtn: { padding: 4 },
  scroll: { padding: 16, gap: 16 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  summaryVal: { fontSize: 14, fontWeight: '600', color: '#111827' },
  xirrCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  xirrValue: { fontSize: 36, fontWeight: '700' },
  xirrHint: { fontSize: 11, color: '#6b7280', textAlign: 'center' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  yearLabel: { width: 44, fontSize: 13, fontWeight: '600', color: '#374151' },
  yearInvested: { flex: 1, fontSize: 12, color: '#6b7280' },
  yearReturn: { fontSize: 13, fontWeight: '600' },
  yearPct: { width: 60, fontSize: 12, textAlign: 'right' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeBuy: { backgroundColor: '#dbeafe' },
  badgeSell: { backgroundColor: '#fce7f3' },
  txBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  txDate: { fontSize: 13, fontWeight: '500', color: '#111827' },
  txMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txCost: { fontSize: 13, fontWeight: '600', color: '#111827' },
  txCostSub: { fontSize: 11, color: '#6b7280' },
  showMore: { alignItems: 'center', paddingTop: 8 },
  showMoreText: { fontSize: 13, color: '#2563eb' },
});
