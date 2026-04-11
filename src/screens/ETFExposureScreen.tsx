/**
 * ETF 實際曝險分析頁面
 * 將所有持有 ETF 的持股比例 × ETF 市值，彙整出等同持有哪些公司、各自台幣金額
 */
import React, { useEffect, useState, useMemo } from 'react';
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
import { useInvestment, getPriceTWD } from '../contexts/InvestmentContext';
import { getETFHoldings, refreshETFHoldings, SUPPORTED_ETF_TICKERS, isSingleAssetETF } from '../utils/etfHoldings';
import type { ETFHolding } from '../types';

function fmtTWD(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return n.toFixed(2) + '%';
}

interface ExposureRow {
  companyName: string;
  totalTWD: number;
  portfolioPct: number;
  sources: { ticker: string; contributionTWD: number }[];
}

export default function ETFExposureScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { positions, prices, usdTwdRate, isLoading: isContextLoading } = useInvestment();

  // ETF ticker → holdings（從 DB / 網路）
  const [holdingsMap, setHoldingsMap] = useState<Map<string, ETFHolding[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failedTickers, setFailedTickers] = useState<string[]>([]);

  // 取得持有的 ETF（在 SUPPORTED_ETF_TICKERS 內）
  const etfPositions = useMemo(() => {
    return Array.from(positions.values()).filter(
      p => p.shares > 0 && SUPPORTED_ETF_TICKERS.includes(p.ticker) && !isSingleAssetETF(p.ticker)
    );
  }, [positions]);

  // 載入所有 ETF 持股（等 InvestmentContext 載完才執行）
  useEffect(() => {
    if (isContextLoading) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const failed: string[] = [];
      const map = new Map<string, ETFHolding[]>();

      await Promise.all(
        etfPositions.map(async pos => {
          try {
            const holdings = await getETFHoldings(pos.ticker);
            if (!cancelled) map.set(pos.ticker, holdings);
          } catch {
            if (!cancelled) failed.push(pos.ticker);
          }
        })
      );

      if (!cancelled) {
        setHoldingsMap(map);
        setFailedTickers(failed);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isContextLoading, etfPositions.map(p => p.ticker).join(',')]);

  // 強制從網路刷新（背景執行，不清空現有資料）
  async function handleRefresh() {
    if (isRefreshing || etfPositions.length === 0) return;
    setIsRefreshing(true);
    const failed: string[] = [];
    const map = new Map<string, ETFHolding[]>(holdingsMap);

    await Promise.all(
      etfPositions.map(async pos => {
        try {
          const holdings = await refreshETFHoldings(pos.ticker);
          map.set(pos.ticker, holdings);
        } catch {
          failed.push(pos.ticker);
        }
      })
    );

    setHoldingsMap(new Map(map));
    setFailedTickers(failed);
    setIsRefreshing(false);
  }

  // 計算曝險彙整
  const { exposureRows, totalPortfolioTWD } = useMemo(() => {
    let totalPortfolioTWD = 0;
    for (const pos of Array.from(positions.values())) {
      if (pos.shares > 0) {
        totalPortfolioTWD += pos.shares * getPriceTWD(pos.ticker, prices, usdTwdRate);
      }
    }

    const map = new Map<string, { totalTWD: number; sources: { ticker: string; contributionTWD: number }[] }>();

    for (const pos of etfPositions) {
      const etfValueTWD = pos.shares * getPriceTWD(pos.ticker, prices, usdTwdRate);
      const holdings = holdingsMap.get(pos.ticker) ?? [];

      for (const h of holdings) {
        const contributionTWD = etfValueTWD * (h.weightPct / 100);
        const existing = map.get(h.companyName);
        if (existing) {
          existing.totalTWD += contributionTWD;
          existing.sources.push({ ticker: pos.ticker, contributionTWD });
        } else {
          map.set(h.companyName, {
            totalTWD: contributionTWD,
            sources: [{ ticker: pos.ticker, contributionTWD }],
          });
        }
      }
    }

    const rows: ExposureRow[] = Array.from(map.entries())
      .map(([companyName, data]) => ({
        companyName,
        totalTWD: data.totalTWD,
        portfolioPct: totalPortfolioTWD > 0 ? (data.totalTWD / totalPortfolioTWD) * 100 : 0,
        sources: data.sources.sort((a, b) => b.contributionTWD - a.contributionTWD),
      }))
      .sort((a, b) => b.totalTWD - a.totalTWD);

    return { exposureRows: rows, totalPortfolioTWD };
  }, [holdingsMap, etfPositions, positions, prices, usdTwdRate]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>實際曝險分析</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleRefresh}
          disabled={isRefreshing || loading || isContextLoading}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <Ionicons name="refresh" size={22} color="#2563eb" />
          )}
        </TouchableOpacity>
      </View>

      {isContextLoading || loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>
            {isContextLoading ? '載入投資組合中…' : '載入 ETF 持股資料中…'}
          </Text>
        </View>
      ) : exposureRows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="analytics-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>尚無可分析的 ETF 持倉</Text>
          <Text style={styles.emptyHint}>
            支援：{SUPPORTED_ETF_TICKERS.filter(t => !isSingleAssetETF(t)).join('、')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {/* 說明列 */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              以 ETF 持股比例 × 持倉市值換算，彙整你實際等同持有的公司曝險。持股資料每月更新一次。
            </Text>
          </View>

          {failedTickers.length > 0 && (
            <View style={styles.warnBox}>
              <Ionicons name="warning-outline" size={14} color="#92400e" />
              <Text style={styles.warnText}>
                {failedTickers.join('、')} 資料載入失敗，已略過
              </Text>
            </View>
          )}

          {/* 欄位標題 */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colRank, styles.colLabel]}>#</Text>
            <Text style={[styles.colName, styles.colLabel]}>公司</Text>
            <Text style={[styles.colValue, styles.colLabel]}>台幣金額</Text>
            <Text style={[styles.colPct, styles.colLabel]}>佔組合</Text>
          </View>

          {exposureRows.map((row, i) => (
            <View key={row.companyName} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
              <Text style={styles.colRank}>{i + 1}</Text>
              <View style={styles.colName}>
                <Text style={styles.companyName} numberOfLines={2}>{row.companyName}</Text>
                <View style={styles.sourceTags}>
                  {row.sources.map(s => (
                    <View key={s.ticker} style={styles.tag}>
                      <Text style={styles.tagText}>{s.ticker}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.colValue}>NT$ {fmtTWD(row.totalTWD)}</Text>
              <Text style={styles.colPct}>{fmtPct(row.portfolioPct)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
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
  loadingText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  emptyText: { fontSize: 16, color: '#9ca3af', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#d1d5db', textAlign: 'center', paddingHorizontal: 32 },
  scroll: { padding: 16, gap: 0 },
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  infoText: { fontSize: 12, color: '#1e40af', lineHeight: 18 },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warnText: { fontSize: 12, color: '#92400e', flex: 1 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 2,
  },
  colLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  rowAlt: { backgroundColor: '#fafafa' },
  colRank: { width: 28, fontSize: 12, color: '#9ca3af', textAlign: 'right' },
  colName: { flex: 1, paddingHorizontal: 8, gap: 4 },
  colValue: { width: 88, fontSize: 12, fontWeight: '600', color: '#111827', textAlign: 'right' },
  colPct: { width: 52, fontSize: 12, fontWeight: '500', color: '#6b7280', textAlign: 'right' },
  companyName: { fontSize: 13, color: '#111827', fontWeight: '500' },
  sourceTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  tag: {
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagText: { fontSize: 10, color: '#1d4ed8', fontWeight: '600' },
});
