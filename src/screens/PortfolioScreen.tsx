/**
 * 投資總覽頁面
 * - 總市值（台幣）
 * - 總投入成本
 * - 未實現損益 + 報酬率
 * - 各持股卡片
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment, getPriceTWD } from '../contexts/InvestmentContext';
import { BottomBar } from '../components';
import { calcUnrealizedGain } from '../utils/stockCalculations';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;

function formatTWD(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}
function formatPct(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}

const SHARE_DECIMAL_PLACES = 2;
const USD_DECIMAL_PLACES = 2;
const TWD_DECIMAL_PLACES = 0;
const ALLOCATION_PCT_DECIMAL_PLACES = 1;
const ALLOCATION_TOP_COUNT = 5;

function formatShares(n: number): string {
  const roundedShares = Math.round(n * (10 ** SHARE_DECIMAL_PLACES)) / (10 ** SHARE_DECIMAL_PLACES);
  return roundedShares.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: SHARE_DECIMAL_PLACES,
  });
}

function formatAllocationPct(n: number): string {
  return `${n.toFixed(ALLOCATION_PCT_DECIMAL_PLACES)}%`;
}

export default function PortfolioScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const {
    positions,
    prices,
    usdTwdRate,
    isLoading,
    isRefreshingPrices,
    refreshPrices,
  } = useInvestment();

  const posArray = useMemo(
    () => Array.from(positions.values()).filter(p => p.shares > 0),
    [positions]
  );

  const { totalValueTWD, totalCostTWD, totalGainTWD, totalGainPct, allocationRows } = useMemo(() => {
    let valTWD = 0;
    let costTWD = 0;
    for (const pos of posArray) {
      const priceTWD = getPriceTWD(pos.ticker, prices, usdTwdRate);
      valTWD += pos.shares * priceTWD;
      costTWD += pos.totalCostTWD;
    }
    const gainTWD = valTWD - costTWD;
    const gainPct = costTWD > 0 ? gainTWD / costTWD : 0;

    const allSortedRows = posArray
      .map(pos => {
        const priceTWD = getPriceTWD(pos.ticker, prices, usdTwdRate);
        const valueTWD = pos.shares * priceTWD;
        const weightPct = valTWD > 0 ? (valueTWD / valTWD) * 100 : 0;
        const displayName = pos.name.trim() !== '' ? pos.name : pos.ticker;
        return { ticker: pos.ticker, displayName, valueTWD, weightPct };
      })
      .sort((a, b) => b.weightPct - a.weightPct);

    const topRows = allSortedRows.slice(0, ALLOCATION_TOP_COUNT);
    const otherRows = allSortedRows.slice(ALLOCATION_TOP_COUNT);
    const otherPct = otherRows.reduce((sum, r) => sum + r.weightPct, 0);
    const otherValueTWD = otherRows.reduce((sum, r) => sum + r.valueTWD, 0);
    const rows = otherRows.length > 0
      ? [...topRows, { ticker: '__other__', displayName: '其他', valueTWD: otherValueTWD, weightPct: otherPct }]
      : topRows;

    return { totalValueTWD: valTWD, totalCostTWD: costTWD, totalGainTWD: gainTWD, totalGainPct: gainPct, allocationRows: rows };
  }, [posArray, prices, usdTwdRate]);

  const gainColor = totalGainTWD >= 0 ? '#16a34a' : '#dc2626';

  const handleRefresh = useCallback(() => {
    refreshPrices(true);
  }, [refreshPrices]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>投資組合</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => refreshPrices(true)}
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
            onPress={() => navigation.navigate('ETFExposure')}
          >
            <Ionicons name="analytics-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('StockWatchlistSettings')}
          >
            <Ionicons name="star-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('AddStockTransaction', {})}
          >
            <Ionicons name="add-circle-outline" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshingPrices} onRefresh={handleRefresh} />
        }
      >
        {/* 總覽卡片 */}
        <TouchableOpacity
          style={styles.summaryCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('PortfolioYearly')}
        >
          <Text style={styles.summaryLabel}>總市值</Text>
          <Text style={styles.summaryValue}>NT$ {formatTWD(totalValueTWD)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summarySubLabel}>總投入成本</Text>
              <Text style={styles.summarySubValue}>{formatTWD(totalCostTWD)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summarySubLabel}>未實現損益</Text>
              <Text style={[styles.summarySubValue, { color: gainColor }]}>
                {totalGainTWD >= 0 ? '+' : ''}{formatTWD(totalGainTWD)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItemFull}>
              <Text style={styles.summarySubLabel}>報酬率</Text>
              <Text style={[styles.summarySubValue, { color: gainColor }]}>
                {formatPct(totalGainPct)}
              </Text>
            </View>
          </View>
          {usdTwdRate > 0 && (
            <Text style={styles.rateHint}>USD/TWD ≈ {usdTwdRate.toFixed(2)}</Text>
          )}
        </TouchableOpacity>

        {posArray.length > 0 && (
          <View style={styles.allocationCard}>
            <Text style={styles.allocationTitle}>持股比例</Text>
            {allocationRows.map(row => (
              <View key={row.ticker} style={styles.allocationRow}>
                <View style={styles.allocationLeft}>
                  {row.ticker === '__other__' ? (
                    <Text style={styles.allocationTicker}>{row.displayName}</Text>
                  ) : (
                    <>
                      <Text style={styles.allocationTicker}>{row.ticker}</Text>
                      {row.displayName !== row.ticker && (
                        <Text style={styles.allocationName} numberOfLines={1}>{row.displayName}</Text>
                      )}
                    </>
                  )}
                </View>
                <View style={styles.allocationRight}>
                  <Text style={styles.allocationPct}>{formatAllocationPct(row.weightPct)}</Text>
                  <Text style={styles.allocationValue}>NT$ {formatTWD(row.valueTWD)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 無持倉提示 */}
        {posArray.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>尚無持倉紀錄</Text>
            <Text style={styles.emptyHint}>點右上角 + 新增一筆</Text>
          </View>
        )}

        {/* 持倉卡片列表 */}
        {posArray.map(pos => {
          const priceTWD = getPriceTWD(pos.ticker, prices, usdTwdRate);
          const valueTWD = pos.shares * priceTWD;
          const { gainTWD, gainPct } = calcUnrealizedGain(pos, priceTWD);
          const cardGainColor = gainTWD >= 0 ? '#16a34a' : '#dc2626';
          const priceCache = prices[pos.ticker];
          const isUS = pos.currency === 'USD';
          const hasSeparateName = pos.name.trim() !== '' && pos.name !== pos.ticker;
          const displayName = hasSeparateName ? pos.name : pos.ticker;
          const displayTicker = hasSeparateName ? pos.ticker : null;
          const nativePrice = priceCache?.price ?? 0;
          const valueNative = pos.shares * nativePrice;
          const nativeGainPct = (nativePrice > 0 && pos.avgCostNative > 0)
            ? (nativePrice - pos.avgCostNative) / pos.avgCostNative
            : null;
          const displayGainPct = isUS ? (nativeGainPct ?? gainPct) : gainPct;
          const displayPrice = priceCache
            ? (isUS
              ? `$${priceCache.price.toFixed(USD_DECIMAL_PLACES)}`
              : `NT$${priceCache.price.toFixed(TWD_DECIMAL_PLACES)}`)
            : '—';
          const displayValue = isUS
            ? `$${valueNative.toLocaleString('zh-TW', {
              minimumFractionDigits: USD_DECIMAL_PLACES,
              maximumFractionDigits: USD_DECIMAL_PLACES,
            })}`
            : `NT$ ${formatTWD(valueTWD)}`;

          return (
            <TouchableOpacity
              key={pos.ticker}
              style={styles.holdingCard}
              onPress={() => navigation.navigate('StockDetail', { ticker: pos.ticker })}
              activeOpacity={0.7}
            >
              <View style={styles.holdingTop}>
                <View>
                  <Text style={styles.holdingTitle}>{displayName}</Text>
                  {displayTicker && <Text style={styles.holdingSubtitle}>{displayTicker}</Text>}
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingValue}>{displayValue}</Text>
                </View>
              </View>
              <View style={styles.holdingMetaRow}>
                <Text style={styles.holdingMeta}>現價 {displayPrice}</Text>
                <Text style={styles.holdingMeta}>
                  均成本 {isUS ? `$${pos.avgCostNative.toFixed(2)}` : `NT$${pos.avgCostTWD.toFixed(2)}`}
                </Text>
              </View>
              <View style={styles.holdingMetaRow}>
                <Text style={styles.holdingMeta}>持有 {formatShares(pos.shares)} 股</Text>
                <Text style={[styles.holdingMetaEmphasis, { color: cardGainColor }]}>
                  報酬率 {formatPct(displayGainPct)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 6 },
  scroll: { padding: 16, gap: 12 },
  summaryCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  summaryLabel: { fontSize: 13, color: '#93c5fd' },
  summaryValue: { fontSize: 32, fontWeight: '700', color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryItem: { flex: 1 },
  summaryItemFull: { flex: 1 },
  summarySubLabel: { fontSize: 11, color: '#93c5fd', marginBottom: 4 },
  summarySubValue: { fontSize: 15, fontWeight: '600', color: '#fff' },
  rateHint: { fontSize: 11, color: '#64748b', marginTop: 4 },
  allocationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  allocationTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  allocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
  },
  allocationLeft: { flex: 1, paddingRight: 12 },
  allocationTicker: { fontSize: 13, fontWeight: '600', color: '#111827' },
  allocationName: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  allocationRight: { alignItems: 'flex-end', gap: 1 },
  allocationPct: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  allocationValue: { fontSize: 11, color: '#6b7280' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },
  holdingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  holdingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  holdingTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  holdingSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  holdingRight: { alignItems: 'flex-end' },
  holdingValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  holdingMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holdingMeta: { fontSize: 12, color: '#6b7280' },
  holdingMetaEmphasis: { fontSize: 12, fontWeight: '600' },
});
