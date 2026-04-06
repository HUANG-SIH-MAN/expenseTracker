/**
 * 投資總覽頁面
 * - 總市值（台幣）
 * - 總投入成本
 * - 未實現損益 + 報酬率
 * - 各持股卡片
 */
import React, { useCallback } from 'react';
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

  const posArray = Array.from(positions.values()).filter(p => p.shares > 0);

  // 計算總覽數字
  let totalValueTWD = 0;
  let totalCostTWD = 0;
  for (const pos of posArray) {
    const priceTWD = getPriceTWD(pos.ticker, prices, usdTwdRate);
    totalValueTWD += pos.shares * priceTWD;
    totalCostTWD += pos.totalCostTWD;
  }
  const totalGainTWD = totalValueTWD - totalCostTWD;
  const totalGainPct = totalCostTWD > 0 ? totalGainTWD / totalCostTWD : 0;

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
            onPress={() => navigation.navigate('ImportStock')}
          >
            <Ionicons name="download-outline" size={22} color="#2563eb" />
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
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>總市值</Text>
          <Text style={styles.summaryValue}>NT$ {formatTWD(totalValueTWD)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summarySubLabel}>總投入成本</Text>
              <Text style={styles.summarySubValue}>NT$ {formatTWD(totalCostTWD)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summarySubLabel}>未實現損益</Text>
              <Text style={[styles.summarySubValue, { color: gainColor }]}>
                {totalGainTWD >= 0 ? '+' : ''}NT$ {formatTWD(totalGainTWD)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summarySubLabel}>報酬率</Text>
              <Text style={[styles.summarySubValue, { color: gainColor }]}>
                {formatPct(totalGainPct)}
              </Text>
            </View>
          </View>
          {usdTwdRate > 0 && (
            <Text style={styles.rateHint}>USD/TWD ≈ {usdTwdRate.toFixed(2)}</Text>
          )}
        </View>

        {/* 無持倉提示 */}
        {posArray.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>尚無持倉紀錄</Text>
            <Text style={styles.emptyHint}>點右上角 ↓ 匯入 Excel，或 + 新增一筆</Text>
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

          return (
            <TouchableOpacity
              key={pos.ticker}
              style={styles.holdingCard}
              onPress={() => navigation.navigate('StockDetail', { ticker: pos.ticker })}
              activeOpacity={0.7}
            >
              <View style={styles.holdingTop}>
                <View>
                  <Text style={styles.holdingTicker}>{pos.ticker}</Text>
                  <Text style={styles.holdingName}>{pos.name}</Text>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingValue}>NT$ {formatTWD(valueTWD)}</Text>
                  <Text style={[styles.holdingGain, { color: cardGainColor }]}>
                    {gainTWD >= 0 ? '+' : ''}NT$ {formatTWD(gainTWD)} ({formatPct(gainPct)})
                  </Text>
                </View>
              </View>
              <View style={styles.holdingBottom}>
                <Text style={styles.holdingMeta}>
                  {pos.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} 股
                  ．成本 NT$ {(pos.totalCostTWD / pos.shares).toFixed(isUS ? 2 : 0)}
                </Text>
                {priceCache && (
                  <Text style={styles.holdingPrice}>
                    現價 {isUS ? `$${priceCache.price.toFixed(2)}` : `NT$${priceCache.price.toFixed(0)}`}
                  </Text>
                )}
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
    gap: 12,
  },
  summaryLabel: { fontSize: 13, color: '#93c5fd' },
  summaryValue: { fontSize: 32, fontWeight: '700', color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1 },
  summarySubLabel: { fontSize: 11, color: '#93c5fd', marginBottom: 2 },
  summarySubValue: { fontSize: 13, fontWeight: '600', color: '#fff' },
  rateHint: { fontSize: 11, color: '#64748b', marginTop: 4 },
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
  holdingTicker: { fontSize: 16, fontWeight: '700', color: '#111827' },
  holdingName: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  holdingRight: { alignItems: 'flex-end' },
  holdingValue: { fontSize: 16, fontWeight: '700', color: '#111827' },
  holdingGain: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  holdingBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  holdingMeta: { fontSize: 12, color: '#6b7280' },
  holdingPrice: { fontSize: 12, color: '#6b7280' },
});
