/**
 * 公司基本面頁面
 * 從「實際曝險分析」點入，顯示個別公司的財務與基本面資料。
 * 資料來源：Alpha Vantage OVERVIEW + INCOME_STATEMENT（3 天快取）
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getStockFundamentals, refreshStockFundamentals } from '../utils/stockFundamentals';
import { fetchWithCORS, getStockPrice } from '../utils/stockPrice';
import { classifyInstrument, normalizeTaiwanTicker } from '../utils/instrumentClassification';
import { fetchAlphaVantageData } from '../utils/alphaVantageApi';
import type { MainStackParamList } from '../navigation/MainStack';
import type { InstrumentMarket, StockFundamentals } from '../types';
import Sparkline from '../components/Sparkline';

type Route = RouteProp<MainStackParamList, 'CompanyFundamentals'>;

const ONE_TRILLION = 1e12;
const ONE_BILLION = 1e9;
const ONE_MILLION = 1e6;
const NO_VALUE = '—';
const PERCENT_MULTIPLIER = 100;
const PERCENT_DECIMAL_PLACES = 1;
const PRICE_DECIMAL_PLACES = 2;
const TW_PRICE_DECIMAL_PLACES = 0;
const PE_DECIMAL_PLACES = 2;
const EPS_DECIMAL_PLACES = 2;
const YOY_STRONG_GROWTH_THRESHOLD = 0.2;
const YOY_NEGATIVE_THRESHOLD = 0;
const PE_LOW_THRESHOLD = 15;
const PE_HIGH_THRESHOLD = 25;
const RATIO_EPSILON = 0.000001;
const SPARKLINE_HEIGHT = 40;
const SPARKLINE_MIN_WIDTH = 180;
const SPARKLINE_HORIZONTAL_PADDING = 64;
const TABLE_COLUMN_GAP = 10;
const EPS_HISTORY_YEAR_COUNT = 5;
const PE_HISTORY_YEAR_COUNT = 5;
const PE_HISTORY_RANGE = '6y';
const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const PE_HISTORY_AVERAGE_DECIMAL_PLACES = 2;
const PE_HISTORY_VALUE_DECIMAL_PLACES = 1;
const TRADING_DAYS_PER_YEAR = 240;
const FINMIND_DATA_API_URL = 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_DATASET_TAIWAN_STOCK_PER = 'TaiwanStockPER';
const FINMIND_DATASET_TAIWAN_STOCK_FINANCIAL_STATEMENTS = 'TaiwanStockFinancialStatements';

type FinancialRowMetrics = StockFundamentals['annualFinancials'][number] & {
  revenueYoy: number | null;
  grossMargin: number | null;
  netMargin: number | null;
};

interface EpsHistoryRow {
  fiscalYear: string;
  eps: number;
}

interface PeBandViewModel {
  label: string;
  hint: string;
  valueColor: string;
}

interface PeHistorySummary {
  min: number;
  avg: number;
  max: number;
  sampleCount: number;
}

function fmtMarketCap(n: number, currencySymbol: string): string {
  if (n <= 0) return NO_VALUE;
  if (n >= ONE_TRILLION) return `${currencySymbol}${(n / ONE_TRILLION).toFixed(2)}T`;
  if (n >= ONE_BILLION) return `${currencySymbol}${(n / ONE_BILLION).toFixed(2)}B`;
  return `${currencySymbol}${(n / ONE_MILLION).toFixed(0)}M`;
}

function fmtBillions(n: number): string {
  if (Math.abs(n) >= ONE_BILLION) return `${(n / ONE_BILLION).toFixed(1)}B`;
  if (Math.abs(n) >= ONE_MILLION) return `${(n / ONE_MILLION).toFixed(0)}M`;
  return `${n}`;
}

function toPercent(numerator: number, denominator: number): number | null {
  if (Math.abs(denominator) <= RATIO_EPSILON) return null;
  return numerator / denominator;
}

function toYoy(current: number, previous: number | null): number | null {
  if (previous == null || Math.abs(previous) <= RATIO_EPSILON) return null;
  return (current - previous) / Math.abs(previous);
}

function fmtPercent(ratio: number | null): string {
  if (ratio == null) return NO_VALUE;
  return `${(ratio * PERCENT_MULTIPLIER).toFixed(PERCENT_DECIMAL_PLACES)}%`;
}

function fmtPe(pe: number | null): string {
  if (pe == null) return NO_VALUE;
  return `${pe.toFixed(PE_HISTORY_VALUE_DECIMAL_PLACES)}x`;
}

function fmtPrice(price: number, market: InstrumentMarket): string {
  const decimals = market === 'TW' ? TW_PRICE_DECIMAL_PLACES : PRICE_DECIMAL_PLACES;
  return price.toFixed(decimals);
}

function fmtEpsDisplay(eps: number, market: InstrumentMarket, currencySymbol: string): string {
  const decimals = market === 'TW' ? TW_PRICE_DECIMAL_PLACES : EPS_DECIMAL_PLACES;
  return `${currencySymbol}${eps.toFixed(decimals)}`;
}

function toOptionalNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const value = parseFloat(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(value)) return null;
  return value;
}

function computePeHistorySummary(values: number[]): PeHistorySummary | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    min,
    avg: Number(avg.toFixed(PE_HISTORY_AVERAGE_DECIMAL_PLACES)),
    max,
    sampleCount: values.length,
  };
}

function buildPeComparisonText(
  currentPe: number | null,
  summary: PeHistorySummary | null,
  market: InstrumentMarket,
): string {
  if (currentPe == null || summary == null) return '資料不足，暫無法比較目前與歷史估值。';
  const yearSpan = PE_HISTORY_YEAR_COUNT;
  if (market === 'TW') {
    if (currentPe > summary.avg) {
      return `目前本益比高於近 ${yearSpan} 年交易日平均值。`;
    }
    if (currentPe < summary.avg) {
      return `目前本益比低於近 ${yearSpan} 年交易日平均值。`;
    }
    return `目前本益比約等於近 ${yearSpan} 年交易日平均值。`;
  }
  const yearLabel = summary.sampleCount;
  if (currentPe > summary.avg) {
    return `目前本益比高於近 ${yearLabel} 年平均。`;
  }
  if (currentPe < summary.avg) {
    return `目前本益比低於近 ${yearLabel} 年平均。`;
  }
  return `目前本益比約等於近 ${yearLabel} 年平均。`;
}

function clampPercent(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getPeBand(peRatio: number | null): PeBandViewModel {
  if (peRatio == null) {
    return {
      label: '資料不足',
      hint: '缺少歷史區間，暫無法判讀',
      valueColor: '#6b7280',
    };
  }
  if (peRatio < PE_LOW_THRESHOLD) {
    return {
      label: '偏低',
      hint: `低於通用區間 ${PE_LOW_THRESHOLD}x`,
      valueColor: '#15803d',
    };
  }
  if (peRatio <= PE_HIGH_THRESHOLD) {
    return {
      label: '中性',
      hint: `${PE_LOW_THRESHOLD}x~${PE_HIGH_THRESHOLD}x 通用區間`,
      valueColor: '#2563eb',
    };
  }
  return {
    label: '偏高',
    hint: `高於通用區間 ${PE_HIGH_THRESHOLD}x`,
    valueColor: '#b45309',
  };
}

function getGrowthToneStyle(yoy: number | null): { containerStyle: object; textStyle: object } {
  if (yoy == null) {
    return {
      containerStyle: styles.yoyNeutralContainer,
      textStyle: styles.yoyNeutralText,
    };
  }
  if (yoy >= YOY_STRONG_GROWTH_THRESHOLD) {
    return {
      containerStyle: styles.yoyPositiveContainer,
      textStyle: styles.yoyPositiveText,
    };
  }
  if (yoy < YOY_NEGATIVE_THRESHOLD) {
    return {
      containerStyle: styles.yoyNegativeContainer,
      textStyle: styles.yoyNegativeText,
    };
  }
  return {
    containerStyle: styles.yoyNeutralContainer,
    textStyle: styles.yoyNeutralText,
  };
}

async function fetchUsYearCloseMap(symbol: string): Promise<Map<string, number>> {
  const url = `${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}?interval=1mo&range=${PE_HISTORY_RANGE}`;
  const response = await fetchWithCORS(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const json = await response.json();
  const timestamps = json?.chart?.result?.[0]?.timestamp as Array<number | null> | undefined;
  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close as Array<number | null> | undefined;
  const yearCloseMap = new Map<string, number>();
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return yearCloseMap;

  const count = Math.min(timestamps.length, closes.length);
  for (let index = 0; index < count; index += 1) {
    const timestamp = timestamps[index];
    const close = closes[index];
    if (typeof timestamp !== 'number' || typeof close !== 'number') continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = new Date(timestamp * 1000);
    const year = String(date.getUTCFullYear());
    yearCloseMap.set(year, close);
  }
  return yearCloseMap;
}

function buildFinMindDatasetUrl(dataset: string, stockNo: string, startDate: string): string {
  return `${FINMIND_DATA_API_URL}?dataset=${dataset}&data_id=${encodeURIComponent(stockNo)}&start_date=${startDate}`;
}

function toDateOnly(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function addYears(baseDate: Date, years: number): Date {
  const next = new Date(baseDate);
  next.setFullYear(baseDate.getFullYear() + years);
  return next;
}

async function fetchTaiwanPerValues(stockNo: string): Promise<number[]> {
  const startDate = toDateOnly(addYears(new Date(), -PE_HISTORY_YEAR_COUNT - 1));
  const url = buildFinMindDatasetUrl(FINMIND_DATASET_TAIWAN_STOCK_PER, stockNo, startDate);
  const response = await fetchWithCORS(url);
  const json = await response.json();
  const rows = Array.isArray(json?.data) ? (json.data as Array<Record<string, unknown>>) : [];
  return rows
    .filter((row) => String(row.stock_id ?? '').trim() === stockNo)
    .map((row) => toOptionalNumber(row.PER))
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
}

async function fetchTaiwanAnnualEpsHistory(stockNo: string): Promise<EpsHistoryRow[]> {
  const startDate = toDateOnly(addYears(new Date(), -EPS_HISTORY_YEAR_COUNT - 2));
  const url = buildFinMindDatasetUrl(
    FINMIND_DATASET_TAIWAN_STOCK_FINANCIAL_STATEMENTS,
    stockNo,
    startDate,
  );
  const response = await fetchWithCORS(url);
  const json = await response.json();
  const rows = Array.isArray(json?.data) ? (json.data as Array<Record<string, unknown>>) : [];
  const annualEpsMap = new Map<string, number>();

  rows.forEach((row) => {
    if (String(row.stock_id ?? '').trim() !== stockNo) return;
    const typeText = String(row.type ?? '');
    const originName = String(row.origin_name ?? '');
    const date = String(row.date ?? '').trim();
    if (!/EPS/i.test(typeText) && !/每股盈餘/.test(originName)) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.endsWith('-12-31')) return;
    const eps = toOptionalNumber(row.value);
    if (eps == null) return;
    annualEpsMap.set(date.slice(0, 4), eps);
  });

  return Array.from(annualEpsMap.entries())
    .map(([fiscalYear, eps]) => ({ fiscalYear, eps }))
    .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))
    .slice(0, EPS_HISTORY_YEAR_COUNT);
}

function FundamentalItem({
  label,
  value,
  hint,
  valueColor = '#111827',
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.fundamentalItem}>
      <Text style={styles.fundamentalLabel}>{label}</Text>
      <Text style={[styles.fundamentalValue, { color: valueColor }]}>{value}</Text>
      {hint ? <Text style={styles.fundamentalHint}>{hint}</Text> : null}
    </View>
  );
}

export default function CompanyFundamentalsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { companyName, stockTicker } = route.params;
  const classification = classifyInstrument({ ticker: stockTicker });
  const currencySymbol = classification.market === 'TW' ? 'NT$' : '$';
  const marketCurrency = classification.market === 'TW' ? 'TWD' : 'USD';

  const [fundamentals, setFundamentals] = useState<StockFundamentals | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [epsHistoryRows, setEpsHistoryRows] = useState<EpsHistoryRow[]>([]);
  const [peHistorySummary, setPeHistorySummary] = useState<PeHistorySummary | null>(null);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationError, setValuationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getStockFundamentals(stockTicker)
      .then(data => setFundamentals(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '無法載入基本面資料'))
      .finally(() => setLoading(false));
  }, [stockTicker]);

  useEffect(() => {
    let active = true;
    getStockPrice(stockTicker, marketCurrency)
      .then((priceCache) => {
        if (active) {
          setCurrentPrice(priceCache?.price ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setCurrentPrice(null);
        }
      });
    return () => {
      active = false;
    };
  }, [stockTicker, marketCurrency, fundamentals?.lastUpdated]);

  useEffect(() => {
    if (classification.market !== 'US' && classification.market !== 'TW') {
      setEpsHistoryRows([]);
      setPeHistorySummary(null);
      setValuationError(null);
      setValuationLoading(false);
      return;
    }

    let active = true;
    setValuationLoading(true);
    setValuationError(null);

    const task = classification.market === 'US'
      ? Promise.all([
        fetchAlphaVantageData('EARNINGS', stockTicker),
        fetchUsYearCloseMap(stockTicker),
      ]).then(([earningsJson, yearCloseMap]) => {
        const annualEarnings = Array.isArray(earningsJson.annualEarnings)
          ? (earningsJson.annualEarnings as Array<Record<string, unknown>>)
          : [];

        const epsRows = annualEarnings
          .map((row) => ({
            fiscalYear: String(row.fiscalDateEnding ?? '').slice(0, 4),
            eps: toOptionalNumber(row.reportedEPS),
          }))
          .filter((row): row is EpsHistoryRow => row.fiscalYear.length === 4 && row.eps != null)
          .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear))
          .slice(0, EPS_HISTORY_YEAR_COUNT);

        const peSamples = epsRows
          .map((row) => {
            const yearClose = yearCloseMap.get(row.fiscalYear);
            if (yearClose == null || row.eps <= RATIO_EPSILON) return null;
            return yearClose / row.eps;
          })
          .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
          .slice(0, PE_HISTORY_YEAR_COUNT);

        return { epsRows, peSamples };
      })
      : Promise.all([
        fetchTaiwanAnnualEpsHistory(normalizeTaiwanTicker(stockTicker)),
        fetchTaiwanPerValues(normalizeTaiwanTicker(stockTicker)),
      ]).then(([epsRows, perValues]) => {
        const peSamples = perValues.slice(-PE_HISTORY_YEAR_COUNT * TRADING_DAYS_PER_YEAR);
        return { epsRows, peSamples };
      });

    task
      .then(({ epsRows, peSamples }) => {
        if (!active) return;
        setEpsHistoryRows(epsRows);
        setPeHistorySummary(computePeHistorySummary(peSamples));
      })
      .catch((e: unknown) => {
        if (!active) return;
        setEpsHistoryRows([]);
        setPeHistorySummary(null);
        setValuationError(e instanceof Error ? e.message : '無法載入歷史估值資料');
      })
      .finally(() => {
        if (active) {
          setValuationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [classification.market, stockTicker]);

  const financialRows = useMemo<FinancialRowMetrics[]>(() => {
    if (!fundamentals) return [];
    const sorted = [...fundamentals.annualFinancials].sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
    return sorted.map((row, index) => {
      const previous = sorted[index + 1];
      return {
        ...row,
        revenueYoy: toYoy(row.totalRevenue, previous?.totalRevenue ?? null),
        grossMargin: toPercent(row.grossProfit, row.totalRevenue),
        netMargin: toPercent(row.netIncome, row.totalRevenue),
      };
    });
  }, [fundamentals]);

  const sparklineValues = useMemo(
    () => [...financialRows].reverse().map((row) => row.totalRevenue),
    [financialRows],
  );

  const sparklineWidth = Math.max(SPARKLINE_MIN_WIDTH, windowWidth - SPARKLINE_HORIZONTAL_PADDING);

  const week52Position = useMemo(() => {
    if (!fundamentals || currentPrice == null) return null;
    const range = fundamentals.week52High - fundamentals.week52Low;
    if (range <= RATIO_EPSILON) return null;
    return clampPercent((currentPrice - fundamentals.week52Low) / range);
  }, [fundamentals, currentPrice]);

  const peBand = useMemo(() => getPeBand(fundamentals?.peRatio ?? null), [fundamentals?.peRatio]);
  const epsHistoryValues = useMemo(
    () => [...epsHistoryRows].reverse().map((row) => row.eps),
    [epsHistoryRows],
  );
  const epsHistoryRangeLabel = useMemo(() => {
    if (epsHistoryRows.length === 0) return NO_VALUE;
    const chronological = [...epsHistoryRows].reverse();
    const startYear = chronological[0]?.fiscalYear ?? NO_VALUE;
    const endYear = chronological[chronological.length - 1]?.fiscalYear ?? NO_VALUE;
    return `${startYear} - ${endYear}`;
  }, [epsHistoryRows]);
  const peComparisonText = useMemo(
    () => buildPeComparisonText(fundamentals?.peRatio ?? null, peHistorySummary, classification.market),
    [fundamentals?.peRatio, peHistorySummary, classification.market],
  );
  const valuationMarketLabel = classification.market === 'TW' ? '台股' : '美股';

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
                value={fundamentals.peRatio != null ? `${fundamentals.peRatio.toFixed(PE_DECIMAL_PLACES)}x` : NO_VALUE}
              />
              <FundamentalItem
                label="P/E 位階"
                value={peBand.label}
                hint={peBand.hint}
                valueColor={peBand.valueColor}
              />
              <FundamentalItem
                label="EPS"
                value={fundamentals.eps != null ? fmtEpsDisplay(fundamentals.eps, classification.market, currencySymbol) : NO_VALUE}
              />
              <FundamentalItem label="52W 最高" value={`${currencySymbol}${fmtPrice(fundamentals.week52High, classification.market)}`} />
              <FundamentalItem label="52W 最低" value={`${currencySymbol}${fmtPrice(fundamentals.week52Low, classification.market)}`} />
              <FundamentalItem
                label="Beta"
                value={fundamentals.beta != null ? fundamentals.beta.toFixed(PE_DECIMAL_PLACES) : NO_VALUE}
              />
            </View>

            <View style={styles.rangeSection}>
              <Text style={styles.rangeTitle}>52W 價位位置</Text>
              {week52Position != null && currentPrice != null ? (
                <>
                  <View style={styles.rangeLabelsStack}>
                    <View style={styles.rangeLabelRowTwo}>
                      <Text style={styles.rangeLabel} numberOfLines={1}>
                        低：{currencySymbol}{fmtPrice(fundamentals.week52Low, classification.market)}
                      </Text>
                      <Text style={[styles.rangeLabel, styles.rangeLabelRight]} numberOfLines={1}>
                        高：{currencySymbol}{fmtPrice(fundamentals.week52High, classification.market)}
                      </Text>
                    </View>
                    <Text style={styles.rangeLabelCurrent} numberOfLines={1}>
                      現價：{currencySymbol}{fmtPrice(currentPrice, classification.market)}
                    </Text>
                  </View>
                  <View style={styles.rangeTrack}>
                    <View style={[styles.rangeFill, { width: `${week52Position * PERCENT_MULTIPLIER}%` }]} />
                  </View>
                  <Text style={styles.rangeHint}>區間位置：{fmtPercent(week52Position)}</Text>
                </>
              ) : (
                <Text style={styles.rangeHint}>現價資料不足，暫無法計算 52W 相對位置</Text>
              )}
            </View>
          </View>

          {(classification.market === 'US' || classification.market === 'TW') && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>歷史本益比 / EPS（{valuationMarketLabel}）</Text>
              {valuationLoading ? (
                <View style={styles.valuationLoadingRow}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.valuationHint}>載入歷史估值中…</Text>
                </View>
              ) : valuationError ? (
                <Text style={styles.valuationError}>{valuationError}</Text>
              ) : (
                <>
                  <View style={styles.valuationCard}>
                    <Text style={styles.valuationTitle}>EPS 歷史</Text>
                    <Sparkline values={epsHistoryValues} width={sparklineWidth} height={SPARKLINE_HEIGHT} />
                    <Text style={styles.valuationHint}>區間：{epsHistoryRangeLabel}</Text>
                  </View>

                  <View style={styles.valuationCard}>
                    <Text style={styles.valuationTitle}>P/E 歷史區間</Text>
                    {peHistorySummary ? (
                      <>
                        <View style={styles.peMetricsRow}>
                          <Text style={styles.peMetricText}>最低 {fmtPe(peHistorySummary.min)}</Text>
                          <Text style={styles.peMetricText}>平均 {fmtPe(peHistorySummary.avg)}</Text>
                          <Text style={styles.peMetricText}>最高 {fmtPe(peHistorySummary.max)}</Text>
                        </View>
                        <Text style={styles.valuationHint}>{peComparisonText}</Text>
                      </>
                    ) : (
                      <Text style={styles.valuationHint}>歷史 P/E 資料不足</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* 年度營收（最近 5 年） */}
          {financialRows.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>年度財務（最近 5 年）</Text>

              <View style={styles.trendSection}>
                <Text style={styles.trendTitle}>5 年營收趨勢</Text>
                <Sparkline values={sparklineValues} width={sparklineWidth} height={SPARKLINE_HEIGHT} />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.cell, styles.yearCell, styles.colLabel]}>年度</Text>
                    <Text style={[styles.cell, styles.valueCell, styles.colLabel]}>總營收</Text>
                    <Text style={[styles.cell, styles.percentCell, styles.colLabel, styles.yoyColumnSpacing]}>營收成長率</Text>
                    <Text style={[styles.cell, styles.percentCell, styles.colLabel, styles.percentColumnSpacing]}>毛利率</Text>
                    <Text style={[styles.cell, styles.percentCell, styles.colLabel, styles.percentColumnSpacing]}>淨利率</Text>
                    <Text style={[styles.cell, styles.valueCell, styles.colLabel]}>淨利</Text>
                  </View>
                  {financialRows.map((row) => {
                    const yoyTone = getGrowthToneStyle(row.revenueYoy);
                    return (
                      <View key={row.fiscalYear} style={styles.tableRow}>
                        <Text style={[styles.cell, styles.yearCell]}>{row.fiscalYear.slice(0, 4)}</Text>
                        <Text style={[styles.cell, styles.valueCell]}>{fmtBillions(row.totalRevenue)}</Text>
                        <View style={[styles.percentBadge, styles.yoyColumnSpacing, yoyTone.containerStyle]}>
                          <Text style={[styles.percentBadgeText, yoyTone.textStyle]}>{fmtPercent(row.revenueYoy)}</Text>
                        </View>
                        <Text style={[styles.cell, styles.percentCell, styles.percentColumnSpacing]}>{fmtPercent(row.grossMargin)}</Text>
                        <Text style={[styles.cell, styles.percentCell, styles.percentColumnSpacing]}>{fmtPercent(row.netMargin)}</Text>
                        <Text style={[styles.cell, styles.valueCell, { color: row.netIncome >= 0 ? '#16a34a' : '#dc2626' }]}>
                          {fmtBillions(row.netIncome)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
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
  fundamentalHint: { fontSize: 10, color: '#6b7280' },
  rangeSection: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f9fafb',
  },
  rangeTitle: { fontSize: 12, fontWeight: '600', color: '#374151' },
  rangeLabelsStack: { gap: 6 },
  rangeLabelRowTwo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rangeLabel: { fontSize: 11, color: '#6b7280', flex: 1 },
  rangeLabelRight: { textAlign: 'right' },
  rangeLabelCurrent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  rangeTrack: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
  },
  rangeFill: {
    height: '100%',
    backgroundColor: '#2563eb',
  },
  rangeHint: { fontSize: 11, color: '#6b7280' },
  trendSection: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  trendTitle: { fontSize: 12, fontWeight: '600', color: '#374151' },
  valuationLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valuationCard: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  valuationTitle: { fontSize: 12, fontWeight: '600', color: '#374151' },
  valuationHint: { fontSize: 11, color: '#6b7280' },
  valuationError: { fontSize: 12, color: '#dc2626' },
  peMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  peMetricText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    alignItems: 'center',
  },
  cell: { fontSize: 13, color: '#374151' },
  yearCell: { width: 56, fontWeight: '600' },
  valueCell: { width: 92, textAlign: 'right' },
  percentCell: { width: 84, textAlign: 'right' },
  yoyColumnSpacing: { marginLeft: TABLE_COLUMN_GAP },
  percentColumnSpacing: { marginLeft: TABLE_COLUMN_GAP / 2 },
  percentBadge: {
    width: 84,
    borderRadius: 999,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentBadgeText: { fontSize: 12, fontWeight: '600' },
  yoyPositiveContainer: { backgroundColor: '#dcfce7' },
  yoyPositiveText: { color: '#15803d' },
  yoyNegativeContainer: { backgroundColor: '#fee2e2' },
  yoyNegativeText: { color: '#b91c1c' },
  yoyNeutralContainer: { backgroundColor: '#f3f4f6' },
  yoyNeutralText: { color: '#6b7280' },
  colLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  phase2Hint: { fontSize: 11, color: '#6b7280' },
});
