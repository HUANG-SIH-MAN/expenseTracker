/**
 * 個股詳情頁
 * - 持倉摘要（股數、平均成本、現價、市值、損益）
 * - XIRR 年化報酬率
 * - 各年度報酬率
 * - 歷史買賣紀錄列表
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
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
import { getETFHoldings, isSingleAssetETF, getSingleAssetDescription, isSupportedETFTicker } from '../utils/etfHoldings';
import { fetchYearEndPriceTWD } from '../utils/stockPrice';
import type { ETFHolding } from '../types';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'StockDetail'>;

function fmtTWD(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}

const YEAR_LAYOUT = {
  yearWidth: 52,
  investedFlex: 1.05,
  gainFlex: 1.15,
  pctFlex: 0.9,
  columnGap: 8,
} as const;
const YEAR_ROW_ALTERNATE_MODULO = 2;
const DEFAULT_VISIBLE_TX_COUNT = 10;
const TX_ACTION_ICON_SIZE = 16;
const TX_ACTION_GAP = 12;

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
  const priceNative = prices[ticker]?.price ?? 0;
  const isUS = pos?.currency === 'USD';
  const valueTWD = pos ? pos.shares * priceTWD : 0;
  const { gainTWD, gainPct } = pos ? calcUnrealizedGain(pos, priceTWD) : { gainTWD: 0, gainPct: 0 };
  const gainColor = gainTWD >= 0 ? '#16a34a' : '#dc2626';

  // 美股：USD 原幣損益（排除匯率）
  const usdGain = (isUS && pos && priceNative > 0)
    ? pos.shares * (priceNative - pos.avgCostNative)
    : null;
  const usdGainPct = (usdGain != null && pos && pos.avgCostNative > 0)
    ? usdGain / (pos.shares * pos.avgCostNative)
    : null;
  // 匯率效果 = TWD損益 - USD損益換算成TWD
  const fxEffect = (usdGain != null) ? gainTWD - usdGain * usdTwdRate : null;

  // XIRR：美股用 USD 原幣計算（排除匯率），台股用 TWD
  const xirr = useMemo(() => {
    if (!pos || pos.shares <= 0) return null;
    const sortedTx = [...txList].sort((a, b) => a.date.localeCompare(b.date));

    if (isUS && priceNative > 0) {
      // 美股：現金流全用 USD，排除匯率影響
      const cashFlows: number[] = [];
      const dates: Date[] = [];
      for (const tx of sortedTx) {
        const usd = tx.usdCost ?? tx.twdCost / (usdTwdRate || 31.73);
        cashFlows.push(tx.type === 'buy' ? -usd : usd);
        dates.push(new Date(tx.date));
      }
      cashFlows.push(pos.shares * priceNative); // 當前市值（USD）
      dates.push(new Date());
      try { return calcXIRR(cashFlows, dates); } catch { return null; }
    }

    // 台股：用 TWD
    if (valueTWD === 0) return null;
    const { cashFlows, dates } = buildXIRRCashFlows(sortedTx, valueTWD);
    try { return calcXIRR(cashFlows, dates); } catch { return null; }
  }, [txList, pos, valueTWD, isUS, priceNative, usdTwdRate]);

  // 各年底收盤價（TWD）：{ 2020: 55.0, 2021: 88.0, ... }
  const [endOfYearPrices, setEndOfYearPrices] = useState<Record<number, number>>({});

  // 各年報酬率
  const yearlyReturns = useMemo(() => {
    if (txList.length === 0) return [];
    const sortedTx = [...txList].sort((a, b) => a.date.localeCompare(b.date));
    return calcYearlyReturns(sortedTx, endOfYearPrices, priceTWD);
  }, [txList, endOfYearPrices, priceTWD]);

  useEffect(() => {
    if (!pos || txList.length === 0) return;
    const currency = pos.currency;
    const firstYear = parseInt(txList[txList.length - 1].date.slice(0, 4)); // txList 是倒序
    const lastFullYear = new Date().getFullYear() - 1;

    async function loadYearEndPrices() {
      const years: number[] = [];
      for (let y = firstYear; y <= lastFullYear; y++) years.push(y);
      if (years.length === 0) return;

      const entries = await Promise.all(
        years.map(async (y) => {
          const price = await fetchYearEndPriceTWD(ticker, currency, y, usdTwdRate);
          return [y, price] as [number, number | null];
        })
      );

      const map: Record<number, number> = {};
      for (const [y, price] of entries) {
        if (price != null) map[y] = price;
      }
      setEndOfYearPrices(map);
    }

    loadYearEndPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, pos?.currency, txList.length, usdTwdRate]);

  const [showAll, setShowAll] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const displayTx = showAll ? txList : txList.slice(0, DEFAULT_VISIBLE_TX_COUNT);

  // ETF 持股 Modal
  const [holdingsVisible, setHoldingsVisible] = useState(false);
  const [holdings, setHoldings] = useState<ETFHolding[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const shouldShowETFInfo = isSupportedETFTicker(ticker);

  async function handleOpenHoldings() {
    setHoldingsVisible(true);
    if (isSingleAssetETF(ticker)) return;
    setHoldingsLoading(true);
    setHoldingsError(null);
    try {
      const data = await getETFHoldings(ticker);
      setHoldings(data);
    } catch {
      setHoldingsError('無法載入持股資料，請稍後再試');
    } finally {
      setHoldingsLoading(false);
    }
  }

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
          {shouldShowETFInfo && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleOpenHoldings}>
              <Ionicons name="information-circle-outline" size={22} color="#2563eb" />
            </TouchableOpacity>
          )}
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
            {/* 第一行：股數 + 均成本 */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>持有股數</Text>
                <Text style={styles.summaryVal}>
                  {pos.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>均成本（原幣/股）</Text>
                <Text style={styles.summaryVal}>
                  {isUS ? '$' : 'NT$'}{pos.avgCostNative.toFixed(isUS ? 2 : 0)}
                </Text>
              </View>
            </View>
            {/* 第二行：現價 + 市值 */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>現價</Text>
                <Text style={styles.summaryVal}>
                  {priceNative > 0
                    ? (isUS ? `$${priceNative.toFixed(2)}` : `NT$${fmtTWD(priceNative)}`)
                    : '—'}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>當前市值（台幣）</Text>
                <Text style={styles.summaryVal}>NT$ {fmtTWD(valueTWD)}</Text>
              </View>
            </View>

            {/* 損益區塊 */}
            <View style={styles.gainBlock}>
              {isUS && usdGain != null ? (
                <View style={styles.gainSimpleRows}>
                  <Text style={styles.gainGroupTitle}>股票漲跌（USD）</Text>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>報酬率</Text>
                    <Text style={[styles.gainBlockVal, { color: usdGain >= 0 ? '#16a34a' : '#dc2626' }]}>
                      {fmtPct(usdGainPct ?? 0)}
                    </Text>
                  </View>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>損益</Text>
                    <Text style={[styles.gainBlockVal, { color: usdGain >= 0 ? '#16a34a' : '#dc2626' }]}>
                      {usdGain >= 0 ? '+' : ''}${usdGain.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.gainGroupTitle}>含匯率（TWD）</Text>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>報酬率</Text>
                    <Text style={[styles.gainBlockVal, { color: gainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                      {fmtPct(gainPct)}
                    </Text>
                  </View>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>損益</Text>
                    <Text style={[styles.gainBlockVal, { color: gainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                      {gainTWD >= 0 ? '+' : ''}NT $ {fmtTWD(gainTWD)}
                    </Text>
                  </View>
                  {fxEffect != null && (
                    <View style={styles.fxEffectSection}>
                      <View style={styles.gainBlockRow}>
                        <Text style={styles.gainBlockLabel}>匯率效果</Text>
                        <Text style={[styles.gainBlockVal, { color: fxEffect >= 0 ? '#16a34a' : '#dc2626' }]}>
                          {fxEffect >= 0 ? '+' : ''}NT $ {fmtTWD(fxEffect)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.gainSimpleRows}>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>報酬率</Text>
                    <Text style={[styles.gainBlockVal, { color: gainColor }]}>
                      {fmtPct(gainPct)}
                    </Text>
                  </View>
                  <View style={styles.gainBlockRow}>
                    <Text style={styles.gainBlockLabel}>未實現損益</Text>
                    <Text style={[styles.gainBlockVal, { color: gainColor }]}>
                      {gainTWD >= 0 ? '+' : ''}NT $ {fmtTWD(gainTWD)}
                    </Text>
                  </View>
                </View>
              )}

              {pos.realizedGainTWD !== 0 && (
                <View style={styles.gainBlockRow}>
                  <Text style={styles.gainBlockLabel}>已實現損益</Text>
                  <Text style={[styles.gainBlockVal, { color: pos.realizedGainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {pos.realizedGainTWD >= 0 ? '+' : ''}NT$ {fmtTWD(pos.realizedGainTWD)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 年化報酬率 */}
        {xirr != null && (
          <View style={styles.xirrCard}>
            <Text style={styles.sectionTitle}>年化報酬率（XIRR）</Text>
            <Text style={[styles.xirrValue, { color: xirr >= 0 ? '#16a34a' : '#dc2626' }]}>
              {fmtPct(xirr)}
            </Text>
            <Text style={styles.xirrHint}>
              {isUS
                ? '以 USD 計算，排除匯率影響'
                : ''}
            </Text>
          </View>
        )}

        {/* 各年報酬率 */}
        {yearlyReturns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>各年度損益</Text>
            <Text style={styles.yearCurrency}>幣別：TWD</Text>
            <View style={styles.yearHeaderRow}>
              <Text style={styles.yearHeaderYear}>年度</Text>
              <Text style={[styles.yearHeaderText, styles.yearHeaderInvested]}>投入</Text>
              <Text style={[styles.yearHeaderText, styles.yearHeaderReturn]}>報酬</Text>
              <Text style={[styles.yearHeaderText, styles.yearHeaderPct]}>報酬率</Text>
            </View>
            {yearlyReturns.map((yr, index) => (
              <View
                key={yr.year}
                style={[
                  styles.yearRow,
                  index % YEAR_ROW_ALTERNATE_MODULO === 0 ? styles.yearRowOdd : styles.yearRowEven,
                ]}
              >
                <Text style={styles.yearLabel}>{yr.year}</Text>
                <Text style={styles.yearInvested}>{fmtTWD(yr.investedTWD)}</Text>
                <Text style={[styles.yearReturn, { color: yr.gainTWD >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {yr.gainTWD >= 0 ? '+' : ''}{fmtTWD(yr.gainTWD)}
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
          {displayTx.map(tx => {
            const isExpanded = expandedTxId === tx.id;
            return (
              <View key={tx.id} style={styles.txItem}>
                <TouchableOpacity
                  style={styles.txCollapsedRow}
                  onPress={() => setExpandedTxId(prev => (prev === tx.id ? null : tx.id))}
                  activeOpacity={0.7}
                >
                  <View style={styles.txCollapsedLeft}>
                    <View style={[styles.txBadge, tx.type === 'buy' ? styles.badgeBuy : styles.badgeSell]}>
                      <Text style={styles.txBadgeText}>{tx.type === 'buy' ? '買入' : '賣出'}</Text>
                    </View>
                    <View>
                      <Text style={styles.txDate}>{tx.date}</Text>
                      <Text style={styles.txMeta}>
                        成交單價：
                        {pos?.currency === 'USD' ? `$${tx.priceNative.toFixed(2)}` : `NT$${tx.priceNative.toFixed(0)}`}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={18}
                    color="#9ca3af"
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.txExpanded}>
                    <View style={styles.txExpandedRow}>
                      <Text style={styles.txExpandedLabel}>交易股數</Text>
                      <Text style={styles.txExpandedValue}>
                        {tx.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} 股
                      </Text>
                    </View>
                    <View style={styles.txExpandedRow}>
                      <Text style={styles.txExpandedLabel}>交易金額（TWD）</Text>
                      <Text style={styles.txExpandedValue}>NT$ {fmtTWD(tx.twdCost)}</Text>
                    </View>
                    {tx.usdCost != null && (
                      <View style={styles.txExpandedRow}>
                        <Text style={styles.txExpandedLabel}>交易金額（USD）</Text>
                        <Text style={styles.txExpandedValue}>${tx.usdCost.toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={styles.txActions}>
                      <TouchableOpacity
                        style={styles.txActionBtn}
                        onPress={() => navigation.navigate('AddStockTransaction', { transaction: tx })}
                      >
                        <Ionicons name="pencil-outline" size={TX_ACTION_ICON_SIZE} color="#6b7280" />
                        <Text style={styles.txActionText}>編輯</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.txActionBtn}
                        onPress={() => handleDelete(tx.id, tx.date, tx.shares)}
                      >
                        <Ionicons name="trash-outline" size={TX_ACTION_ICON_SIZE} color="#ef4444" />
                        <Text style={[styles.txActionText, styles.txDeleteText]}>刪除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {txList.length > DEFAULT_VISIBLE_TX_COUNT && !showAll && (
            <TouchableOpacity style={styles.showMore} onPress={() => setShowAll(true)}>
              <Text style={styles.showMoreText}>顯示全部 {txList.length} 筆</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ETF 持股明細 Modal */}
      <Modal
        visible={holdingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setHoldingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{ticker} 持股明細</Text>
              <TouchableOpacity onPress={() => setHoldingsVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {isSingleAssetETF(ticker) ? (
              <View style={styles.modalCenter}>
                <Ionicons
                  name={ticker === 'GLD' ? 'star' : 'logo-bitcoin'}
                  size={32}
                  color={ticker === 'GLD' ? '#d97706' : '#f59e0b'}
                />
                <Text style={styles.modalInfoText}>
                  {getSingleAssetDescription(ticker)}
                </Text>
              </View>
            ) : holdingsLoading ? (
              <View style={styles.modalCenter}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.modalHint}>載入中…</Text>
              </View>
            ) : holdingsError ? (
              <View style={styles.modalCenter}>
                <Text style={styles.modalErrorText}>{holdingsError}</Text>
              </View>
            ) : holdings.length === 0 ? (
              <View style={styles.modalCenter}>
                <Ionicons name="construct-outline" size={28} color="#d1d5db" />
                <Text style={styles.modalInfoText}>台股 ETF 持股資料暫不支援{'\n'}未來版本更新</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalSubHint}>Top {holdings.length} 持股（持股資料每月更新）</Text>
                <ScrollView style={styles.modalScroll}>
                  {holdings.map(h => (
                    <View key={h.rank} style={styles.holdingRow}>
                      <Text style={styles.holdingRank}>{h.rank}</Text>
                      <Text style={styles.holdingName} numberOfLines={1}>{h.companyName}</Text>
                      <Text style={styles.holdingPct}>{h.weightPct.toFixed(2)}%</Text>
                    </View>
                  ))}
                  <Text style={styles.modalLastUpdated}>
                    更新時間：{holdings[0]?.lastUpdated ? new Date(holdings[0].lastUpdated).toLocaleDateString('zh-TW') : '—'}
                  </Text>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#1e3a5f',
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
  summaryLabel: { fontSize: 11, color: '#93c5fd', marginBottom: 4 },
  summaryVal: { fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  gainBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#31547c',
    paddingTop: 12,
    gap: 10,
  },
  gainBlockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  gainBlockLabel: { fontSize: 12, color: '#bfdbfe' },
  gainBlockVal: { fontSize: 15, fontWeight: '700' },
  gainSimpleRows: { gap: 6 },
  gainGroupTitle: { fontSize: 11, color: '#93c5fd', fontWeight: '600', marginTop: 4 },
  fxEffectSection: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#31547c',
  },
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
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    gap: YEAR_LAYOUT.columnGap,
    borderRadius: 8,
  },
  yearRowOdd: { backgroundColor: '#ffffff' },
  yearRowEven: { backgroundColor: '#f9fafb' },
  yearCurrency: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  yearHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    gap: YEAR_LAYOUT.columnGap,
  },
  yearHeaderYear: { width: YEAR_LAYOUT.yearWidth, fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  yearHeaderText: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textAlign: 'right' },
  yearHeaderInvested: { flex: YEAR_LAYOUT.investedFlex },
  yearHeaderReturn: { flex: YEAR_LAYOUT.gainFlex },
  yearHeaderPct: { flex: YEAR_LAYOUT.pctFlex },
  yearLabel: { width: YEAR_LAYOUT.yearWidth, fontSize: 13, fontWeight: '600', color: '#374151' },
  yearInvested: { flex: YEAR_LAYOUT.investedFlex, fontSize: 12, color: '#6b7280', textAlign: 'right' },
  yearReturn: { flex: YEAR_LAYOUT.gainFlex, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  yearPct: { flex: YEAR_LAYOUT.pctFlex, fontSize: 12, textAlign: 'right' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  txItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  txCollapsedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  txCollapsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  txBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeBuy: { backgroundColor: '#dbeafe' },
  badgeSell: { backgroundColor: '#fce7f3' },
  txBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  txDate: { fontSize: 13, fontWeight: '500', color: '#111827' },
  txMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  txExpanded: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    gap: 8,
  },
  txExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txExpandedLabel: { fontSize: 12, color: '#6b7280' },
  txExpandedValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  txActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: TX_ACTION_GAP,
    paddingTop: 2,
  },
  txActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txActionText: { fontSize: 12, color: '#6b7280' },
  txDeleteText: { color: '#ef4444' },
  showMore: { alignItems: 'center', paddingTop: 8 },
  showMoreText: { fontSize: 13, color: '#2563eb' },
  // ETF Holdings Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 36, height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSubHint: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  modalScroll: { paddingHorizontal: 20 },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  holdingRank: { width: 22, fontSize: 12, color: '#9ca3af', textAlign: 'right' },
  holdingName: { flex: 1, fontSize: 13, color: '#111827' },
  holdingPct: { fontSize: 13, fontWeight: '600', color: '#374151', width: 56, textAlign: 'right' },
  modalCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  modalHint: { fontSize: 13, color: '#9ca3af' },
  modalInfoText: { fontSize: 14, color: '#374151', textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 },
  modalErrorText: { fontSize: 13, color: '#dc2626', textAlign: 'center', paddingHorizontal: 24 },
  modalLastUpdated: { fontSize: 11, color: '#d1d5db', textAlign: 'right', paddingVertical: 12 },
});
