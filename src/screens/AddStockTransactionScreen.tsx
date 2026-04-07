/**
 * 手動新增股票買賣紀錄
 */
import React, { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment } from '../contexts/InvestmentContext';
import type { StockTransaction } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Route = RouteProp<MainStackParamList, 'AddStockTransaction'>;

const US_TICKERS = ['NVDA', 'QQQ', 'SMH', 'GLD', 'IBIT', 'ARKK'];
const TW_TICKERS = ['006208'];
const ALL_TICKERS = [...TW_TICKERS, ...US_TICKERS];

const TICKER_NAMES: Record<string, string> = {
  '006208': '富邦台灣優質高息 ETF',
  NVDA: 'NVIDIA',
  QQQ: 'Invesco QQQ ETF',
  SMH: 'VanEck Semiconductor ETF',
  GLD: 'SPDR Gold Shares ETF',
  IBIT: 'iShares Bitcoin Trust ETF',
  ARKK: 'ARK Innovation ETF',
};

function generateId(): string {
  return `stock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddStockTransactionScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const editingTx = route.params?.transaction;
  const isEdit = !!editingTx;

  const [txType, setTxType] = useState<'buy' | 'sell'>(editingTx?.type ?? 'buy');
  const [ticker, setTicker] = useState(editingTx?.ticker ?? route.params?.ticker ?? '006208');
  const [date, setDate] = useState(editingTx?.date ?? todayISO());
  const [shares, setShares] = useState(editingTx?.shares.toString() ?? '');
  const [priceNative, setPriceNative] = useState(editingTx?.priceNative.toString() ?? '');
  const [twdCost, setTwdCost] = useState(editingTx?.twdCost.toString() ?? '');
  const [usdCost, setUsdCost] = useState(editingTx?.usdCost?.toString() ?? '');
  const [exchangeRate, setExchangeRate] = useState(editingTx?.exchangeRate?.toString() ?? '');
  const [note, setNote] = useState(editingTx?.note ?? '');
  const [saving, setSaving] = useState(false);
  const { addTransaction, updateTransaction } = useInvestment();

  const isUS = US_TICKERS.includes(ticker);

  // 當股數、股價變更時，若為美股則更新預填 USD 成本
  React.useEffect(() => {
    if (!isUS || isEdit) return; // 編輯模式或非美股不自動改
    const s = parseFloat(shares);
    const p = parseFloat(priceNative);
    if (!isNaN(s) && !isNaN(p)) {
      setUsdCost((s * p).toFixed(2));
    }
  }, [shares, priceNative, isUS, isEdit]);

  // 當台幣成本、USD 成本變更時，自動更新匯率提示
  React.useEffect(() => {
    if (!isUS) return;
    const twd = parseFloat(twdCost);
    const usd = parseFloat(usdCost);
    if (!isNaN(twd) && !isNaN(usd) && usd !== 0) {
      setExchangeRate((twd / usd).toFixed(4));
    }
  }, [twdCost, usdCost, isUS]);

  async function handleSave() {
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(priceNative);
    const twdNum = parseFloat(twdCost);

    if (!ticker) return Alert.alert('請選擇股票');
    if (isNaN(sharesNum) || sharesNum <= 0) return Alert.alert('請輸入有效股數');
    if (isNaN(priceNum) || priceNum <= 0) return Alert.alert('請輸入有效股價');
    if (isNaN(twdNum) || twdNum <= 0) return Alert.alert('請輸入台幣成本');

    let usdNum = undefined;
    let rateNum = undefined;
    if (isUS) {
      usdNum = parseFloat(usdCost);
      rateNum = parseFloat(exchangeRate);
      if (isNaN(usdNum) || usdNum <= 0) return Alert.alert('請輸入有效 USD 成本');
      if (isNaN(rateNum) || rateNum <= 0) return Alert.alert('請輸入有效換匯匯率');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('日期格式應為 YYYY-MM-DD');

    const tx: StockTransaction = {
      id: editingTx?.id ?? generateId(),
      ticker,
      name: TICKER_NAMES[ticker] ?? ticker,
      date,
      type: txType,
      shares: sharesNum,
      priceNative: priceNum,
      usdCost: usdNum,
      twdCost: twdNum,
      exchangeRate: rateNum,
      note: note.trim() || undefined,
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          {/* 買/賣切換 */}
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, txType === 'buy' && styles.toggleActive]}
              onPress={() => setTxType('buy')}
            >
              <Text style={[styles.toggleText, txType === 'buy' && styles.toggleTextActive]}>買入</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, txType === 'sell' && styles.toggleActive]}
              onPress={() => setTxType('sell')}
            >
              <Text style={[styles.toggleText, txType === 'sell' && styles.toggleTextActive]}>賣出</Text>
            </TouchableOpacity>
          </View>

          {/* 股票選擇 */}
          <View style={styles.field}>
            <Text style={styles.label}>股票</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tickerScroll}>
              {ALL_TICKERS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tickerChip, ticker === t && styles.tickerChipActive]}
                  onPress={() => setTicker(t)}
                >
                  <Text style={[styles.tickerChipText, ticker === t && styles.tickerChipTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {ticker && (
              <Text style={styles.tickerNameHint}>{TICKER_NAMES[ticker]}</Text>
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

          {/* 股價（原幣） */}
          <View style={styles.field}>
            <Text style={styles.label}>
              {txType === 'buy' ? '買入股價' : '賣出股價'}（{isUS ? 'USD' : 'TWD'}）
            </Text>
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
            <Text style={styles.label}>台幣{txType === 'buy' ? '成本' : '收入'}（NT$）</Text>
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
                <Text style={styles.label}>USD 成本</Text>
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
  scroll: { padding: 16, gap: 16 },
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
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151' },
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
  tickerScroll: { marginBottom: 4 },
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
  tickerNameHint: { fontSize: 12, color: '#6b7280' },
});
