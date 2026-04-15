/**
 * 手動新增股票買賣紀錄
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment } from '../contexts/InvestmentContext';
import { getStockWatchlist } from '../utils/storage';
import { getStockPrice } from '../utils/stockPrice';
import { classifyInstrument } from '../utils/instrumentClassification';
import {
  applyDividendReinvestToNote,
  noteIndicatesDividendReinvest,
  stripDividendReinvestMarker,
} from '../utils/stockDividendReinvest';
import type { StockTransaction, StockWatchlistItem, StockCurrency } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'AddStockTransaction'>;
type PickerMode = 'watchlist' | 'custom';
const FORM_BOTTOM_PADDING = 24;

function generateId(): string {
  return `stock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inferTickerCurrency(ticker: string): StockCurrency {
  const classification = classifyInstrument({ ticker });
  return classification.market === 'TW' ? 'TWD' : 'USD';
}

export default function AddStockTransactionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const editingTx = route.params?.transaction;
  const isEdit = !!editingTx;

  // ── 股票選擇狀態 ──────────────────────────────
  const [pickerMode, setPickerMode] = useState<PickerMode>('watchlist');
  const [watchlist, setWatchlist] = useState<StockWatchlistItem[]>([]);
  const [ticker, setTicker] = useState(editingTx?.ticker ?? route.params?.ticker ?? '');
  const [tickerName, setTickerName] = useState(editingTx?.name ?? '');
  const [tickerCurrency, setTickerCurrency] = useState<StockCurrency>(
    editingTx
      ? (editingTx.usdCost != null ? 'USD' : 'TWD')
      : inferTickerCurrency(route.params?.ticker ?? '')
  );
  // 自行輸入模式的暫存值
  const [customInput, setCustomInput] = useState('');
  const [validating, setValidating] = useState(false);

  // ── 交易資料 ──────────────────────────────────
  const [txType, setTxType] = useState<'buy' | 'sell'>(editingTx?.type ?? 'buy');
  const [date, setDate] = useState(editingTx?.date ?? todayISO());
  const [shares, setShares] = useState(editingTx?.shares.toString() ?? '');
  const [priceNative, setPriceNative] = useState(editingTx?.priceNative.toString() ?? '');
  const [twdCost, setTwdCost] = useState(editingTx?.twdCost.toString() ?? '');
  const [usdCost, setUsdCost] = useState(editingTx?.usdCost?.toString() ?? '');
  const [exchangeRate, setExchangeRate] = useState(editingTx?.exchangeRate?.toString() ?? '');
  const [note, setNote] = useState(() => {
    const raw = editingTx?.note ?? '';
    if (editingTx?.type === 'sell') return stripDividendReinvestMarker(raw);
    return raw;
  });
  const [saving, setSaving] = useState(false);
  const { addTransaction, updateTransaction } = useInvestment();

  const isUS = tickerCurrency === 'USD';
  const isDividendReinvestNote = noteIndicatesDividendReinvest(note);

  React.useEffect(() => {
    if (txType === 'sell') {
      setNote(prev => stripDividendReinvestMarker(prev));
    }
  }, [txType]);

  // 載入自選股清單
  useFocusEffect(
    useCallback(() => {
      getStockWatchlist().then(items => {
        setWatchlist(items);
        // 編輯模式：直接沿用 ticker，不需重選
        if (!isEdit && !ticker && items.length > 0) {
          const first = items[0];
          setTicker(first.ticker);
          setTickerName(first.name);
          setTickerCurrency(inferTickerCurrency(first.ticker));
        }
      });
    }, [isEdit, ticker])
  );

  // 自動計算 USD 成本
  React.useEffect(() => {
    if (!isUS || isEdit) return;
    const s = parseFloat(shares);
    const p = parseFloat(priceNative);
    if (!isNaN(s) && !isNaN(p)) {
      setUsdCost((s * p).toFixed(2));
    }
  }, [shares, priceNative, isUS, isEdit]);

  // 自動計算匯率
  React.useEffect(() => {
    if (!isUS) return;
    const twd = parseFloat(twdCost);
    const usd = parseFloat(usdCost);
    if (!isNaN(twd) && !isNaN(usd) && usd !== 0) {
      setExchangeRate((twd / usd).toFixed(4));
    }
  }, [twdCost, usdCost, isUS]);

  // 選取常用清單中的股票
  function selectFromWatchlist(item: StockWatchlistItem) {
    setTicker(item.ticker);
    setTickerName(item.name);
    setTickerCurrency(inferTickerCurrency(item.ticker));
  }

  // 自行輸入：驗證並確認
  async function handleValidateCustom() {
    const t = customInput.trim().toUpperCase();
    if (!t) return Alert.alert('請輸入股票代號');
    setValidating(true);
    try {
      const inferredCurrency = inferTickerCurrency(t);
      const result = await getStockPrice(t, inferredCurrency, true);
      if (result == null) {
        Alert.alert('找不到此股票', `無法驗證「${t}」，請確認代號是否正確。`);
        return;
      }
      setTicker(t);
      setTickerName(t);
      setTickerCurrency(inferredCurrency);
      Alert.alert('驗證成功', `已選取「${t}」（${inferredCurrency}），現價 ${result.price}`);
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    if (!ticker) return Alert.alert('請先選擇股票');
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(priceNative);
    const twdNum = parseFloat(twdCost);

    if (isNaN(sharesNum) || sharesNum <= 0) return Alert.alert('請輸入有效股數');
    if (isNaN(priceNum) || priceNum <= 0) return Alert.alert('請輸入有效股價');
    const isDrip = isDividendReinvestNote && txType === 'buy';
    if (!isDrip && (isNaN(twdNum) || twdNum <= 0)) return Alert.alert('請輸入台幣成本');
    const finalTwdCost = (isDrip && isNaN(twdNum)) ? 0 : twdNum;

    let usdNum: number | undefined;
    let rateNum: number | undefined;
    if (isUS) {
      usdNum = parseFloat(usdCost);
      rateNum = parseFloat(exchangeRate);
      if (!isDrip) {
        if (isNaN(usdNum) || usdNum <= 0) {
          return Alert.alert(`請輸入有效 USD ${txType === 'buy' ? '成本' : '收入'}`);
        }
        if (isNaN(rateNum) || rateNum <= 0) return Alert.alert('請輸入有效換匯匯率');
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('日期格式應為 YYYY-MM-DD');

    const noteAfterSellStrip =
      txType === 'sell' ? stripDividendReinvestMarker(note) : note;
    const finalNoteTrimmed = noteAfterSellStrip.trim();
    const tx: StockTransaction = {
      id: editingTx?.id ?? generateId(),
      ticker,
      name: tickerName || ticker,
      date,
      type: txType,
      shares: sharesNum,
      priceNative: priceNum,
      usdCost: usdNum,
      twdCost: finalTwdCost,
      exchangeRate: rateNum,
      note: finalNoteTrimmed || undefined,
      createdAt: editingTx?.createdAt ?? new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateTransaction(tx);
      } else {
        await addTransaction(tx);
      }
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? '編輯交易' : '新增交易'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            <Text style={[styles.saveBtnText, saving && { opacity: 0.4 }]}>儲存</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + FORM_BOTTOM_PADDING }]}
        >
          {/* 買/賣切換 */}
          <View style={styles.toggleRow}>
            {(['buy', 'sell'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.toggleBtn, txType === t && styles.toggleActive]}
                onPress={() => setTxType(t)}
              >
                <Text style={[styles.toggleText, txType === t && styles.toggleTextActive]}>
                  {t === 'buy' ? '買入' : '賣出'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {txType === 'buy' && (
            <View style={styles.field}>
              <View style={styles.switchRow}>
                <Text style={styles.label}>股利再投資（DRIP）</Text>
                <Switch
                  accessibilityLabel="股利再投資"
                  value={isDividendReinvestNote}
                  onValueChange={v => setNote(prev => applyDividendReinvestToNote(prev, v))}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={isDividendReinvestNote ? '#2563eb' : '#f4f4f5'}
                />
              </View>
              <Text style={styles.hintText}>
                儲存為買入；台幣成本請填券商結單上股利再投資所動用之金額（等同股利金額）。
              </Text>
            </View>
          )}

          {/* ── 股票選擇區 ── */}
          <View style={styles.field}>
            <View style={styles.pickerHeader}>
              <Text style={styles.label}>股票</Text>
              {/* 常用清單 / 自行輸入 切換 */}
              <View style={styles.modeToggle}>
                {(['watchlist', 'custom'] as PickerMode[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeBtn, pickerMode === m && styles.modeBtnActive]}
                    onPress={() => setPickerMode(m)}
                  >
                    <Text style={[styles.modeBtnText, pickerMode === m && styles.modeBtnTextActive]}>
                      {m === 'watchlist' ? '常用清單' : '自行輸入'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {pickerMode === 'watchlist' ? (
              <>
                {/* 常用清單 chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tickerScroll}>
                  {watchlist.map(item => (
                    <TouchableOpacity
                      key={item.ticker}
                      style={[styles.tickerChip, ticker === item.ticker && styles.tickerChipActive]}
                      onPress={() => selectFromWatchlist(item)}
                    >
                      <Text style={[styles.tickerChipText, ticker === item.ticker && styles.tickerChipTextActive]}>
                        {item.ticker}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* 管理清單捷徑 */}
                  <TouchableOpacity
                    style={styles.manageChip}
                    onPress={() => navigation.navigate('StockWatchlistSettings')}
                  >
                    <Ionicons name="settings-outline" size={14} color="#6b7280" />
                    <Text style={styles.manageChipText}>管理</Text>
                  </TouchableOpacity>
                </ScrollView>
                {ticker ? (
                  <Text style={styles.tickerNameHint}>
                    {tickerName}{tickerName !== ticker ? '' : ''}
                    {'  '}
                    <Text style={[styles.currencyTag, isUS ? styles.currencyTagUSD : styles.currencyTagTWD]}>
                      {tickerCurrency}
                    </Text>
                  </Text>
                ) : (
                  <Text style={styles.tickerNameHint}>請從清單選擇股票</Text>
                )}
              </>
            ) : (
              <>
                {/* 自行輸入 */}
                <View style={styles.customRow}>
                  <TextInput
                    style={[styles.input, styles.customInput]}
                    value={customInput}
                    onChangeText={t => setCustomInput(t.toUpperCase())}
                    placeholder="輸入代號，如 AAPL"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.validateBtn, validating && { opacity: 0.6 }]}
                    onPress={handleValidateCustom}
                    disabled={validating}
                  >
                    {validating
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.validateBtnText}>驗證</Text>
                    }
                  </TouchableOpacity>
                </View>
                {ticker && (
                  <Text style={styles.tickerNameHint}>
                    已選取：{ticker}
                    {'  '}
                    <Text style={[styles.currencyTag, isUS ? styles.currencyTagUSD : styles.currencyTagTWD]}>
                      {tickerCurrency}
                    </Text>
                  </Text>
                )}
                <Text style={styles.tickerNameHint}>幣別由系統自動判斷（台股=TWD，美股=USD）</Text>
              </>
            )}
          </View>

          {/* 日期 */}
          <View style={styles.field}>
            <Text style={styles.label}>日期（YYYY-MM-DD）</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="2024-01-15"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* 股數 */}
          <View style={styles.field}>
            <Text style={styles.label}>股數</Text>
            <TextInput
              style={styles.input}
              value={shares}
              onChangeText={setShares}
              placeholder={isUS ? '1.5' : '100'}
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>

          {/* 股價 */}
          <View style={styles.field}>
            <Text style={styles.label}>
              {txType === 'buy' ? '買入股價' : '賣出股價'}（{isUS ? 'USD' : 'TWD'}）
            </Text>
            {txType === 'buy' && isDividendReinvestNote && (
              <Text style={styles.hintText}>再投資成交價，依結單填寫。</Text>
            )}
            <TextInput
              style={styles.input}
              value={priceNative}
              onChangeText={setPriceNative}
              placeholder={isUS ? '584.98' : '171.6'}
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>

          {/* 台幣成本 */}
          <View style={styles.field}>
            <Text style={styles.label}>
              台幣{txType === 'buy' ? '成本' : '收入'}（NT$）
              {isDividendReinvestNote && txType === 'buy' ? '（備註用，不計入成本）' : ''}
            </Text>
            {txType === 'buy' && isDividendReinvestNote && (
              <Text style={styles.hintText}>可填股利金額供參考；此欄位不計入成本計算。</Text>
            )}
            <TextInput
              style={styles.input}
              value={twdCost}
              onChangeText={setTwdCost}
              placeholder="30000"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>

          {/* 美股額外欄位 */}
          {isUS && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>
                  {isDividendReinvestNote && txType === 'buy'
                    ? 'USD 股利金額（不計入成本）'
                    : `USD ${txType === 'buy' ? '成本' : '收入'}`}
                </Text>
                <TextInput
                  style={styles.input}
                  value={usdCost}
                  onChangeText={setUsdCost}
                  placeholder="1000.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>換匯匯率（如 32.5）</Text>
                <TextInput
                  style={styles.input}
                  value={exchangeRate}
                  onChangeText={setExchangeRate}
                  placeholder="32.50"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
              </View>
            </>
          )}

          {/* 備註 */}
          <View style={styles.field}>
            <Text style={styles.label}>備註（選填）</Text>
            <TextInput
              style={[styles.input, styles.inputNote]}
              value={note}
              onChangeText={setNote}
              placeholder="定期定額"
              placeholderTextColor="#9ca3af"
              multiline
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#111827' },
  saveBtn: { padding: 4 },
  saveBtnText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  scroll: { flexGrow: 1, padding: 16, gap: 16 },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  toggleTextActive: { color: '#111827', fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hintText: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151' },
  // 股票選擇器
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    padding: 2,
  },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  modeBtnActive: { backgroundColor: '#fff' },
  modeBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  modeBtnTextActive: { color: '#111827', fontWeight: '600' },
  tickerScroll: { marginBottom: 2 },
  tickerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    marginVertical: 2,
  },
  tickerChipActive: { backgroundColor: '#2563eb' },
  tickerChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  tickerChipTextActive: { color: '#fff', fontWeight: '600' },
  manageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginVertical: 2,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
  },
  manageChipText: { fontSize: 12, color: '#6b7280' },
  tickerNameHint: { fontSize: 12, color: '#6b7280' },
  currencyTag: { fontSize: 11, fontWeight: '700', borderRadius: 4, overflow: 'hidden' },
  currencyTagUSD: { color: '#1d4ed8' },
  currencyTagTWD: { color: '#15803d' },
  // 自行輸入
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customInput: { flex: 1 },
  validateBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 52,
    alignItems: 'center',
  },
  validateBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // 通用輸入框
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  inputNote: { minHeight: 72, textAlignVertical: 'top' },
});
