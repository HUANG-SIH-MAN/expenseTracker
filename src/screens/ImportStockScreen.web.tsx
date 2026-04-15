/**
 * CSV 匯入頁面（Web）：使用隱藏 file input + FileReader 讀檔，
 * 不經 expo-document-picker / expo-file-system，與 ImportExportScreen.web 相同策略。
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInvestment } from '../contexts/InvestmentContext';
import { importStockCSV } from '../utils/stockImport';
import { getStockWatchlist, saveStockWatchlistItem } from '../utils/storage';
import type { StockTransaction } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const PARSING_MSG = '正在解析 CSV，請稍候…';
const IMPORTING_MSG = '正在匯入股票紀錄，請稍候…';
const SUCCESS_IMPORT_TITLE = '匯入完成';
const SUCCESS_IMPORT_BODY = '已成功匯入 %d 筆交易紀錄。';
const SUCCESS_WATCHLIST_SUFFIX = '\n同時新增 %d 支股票至自選股清單。';
const ERROR_IMPORT_STOCK = '匯入失敗或無法儲存，請稍後再試。';
const IMPORT_SUCCESS_ALERT_DELAY_MS = 300;
const BTN_OK = '確定';
const OVERLAY_BG = 'rgba(0,0,0,0.45)';

const PREVIEW_ROW_DATE_WIDTH = 88;
const PREVIEW_ROW_TICKER_MIN_WIDTH = 72;
const PREVIEW_ROW_COST_MIN_WIDTH = 80;
const PREVIEW_ROW_SHARES_TAIL_PADDING = 12;

const STOCK_TEMPLATE_CSV = [
  '日期,股票代號,類型,股數,成交價,幣別,TWD成本,USD成本',
  '2024-01-15,006208,buy,10,150,TWD,1500,',
  '2024-01-15,2330,buy,5,850,TWD,4250,',
  '2024-01-15,NVDA,buy,1,500,USD,15000,490',
  '2024-03-01,NVDA,drip,0.5,820,USD,,411',
  '2024-06-10,NVDA,sell,5,900,USD,142000,4500',
].join('\n');

function handleDownloadStockTemplate() {
  const filename = '股票匯入範本.csv';
  const content = '\uFEFF' + STOCK_TEMPLATE_CSV;
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // 靜默失敗
  }
}

export default function ImportStockScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { importTransactions } = useInvestment();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<{
    transactions: StockTransaction[];
    skippedRows: number;
    errors: string[];
    byTicker: Record<string, number>;
  } | null>(null);

  const applyCsvText = useCallback((csvText: string) => {
    const importResult = importStockCSV(csvText);
    const byTicker: Record<string, number> = {};
    for (const tx of importResult.transactions) {
      byTicker[tx.ticker] = (byTicker[tx.ticker] ?? 0) + 1;
    }
    setPreview({
      ...importResult,
      byTicker,
    });
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setIsParsing(true);
      setPreview(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = typeof reader.result === 'string' ? reader.result : '';
          applyCsvText(text);
        } catch {
          Alert.alert('解析失敗', '無法讀取 CSV 檔案，請確認檔案格式正確。');
        } finally {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setIsParsing(false);
        Alert.alert('解析失敗', '無法讀取 CSV 檔案，請確認檔案格式正確。');
      };
      reader.readAsText(file, 'UTF-8');
    },
    [applyCsvText],
  );

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  async function handleConfirmImport() {
    if (!preview || preview.transactions.length === 0) return;

    const ok = window.confirm(
      `將匯入 ${preview.transactions.length} 筆交易紀錄，是否繼續？`,
    );
    if (!ok) return;

    setIsImporting(true);
    try {
      await importTransactions(preview.transactions);

      const watchlist = await getStockWatchlist();
      const existing = new Set(watchlist.map(w => w.ticker));
      const toAdd = Object.entries(preview.byTicker).filter(([ticker]) => !existing.has(ticker));
      if (toAdd.length > 0) {
        const baseOrder = watchlist.length;
        for (let i = 0; i < toAdd.length; i++) {
          const [ticker] = toAdd[i];
          const sample = preview.transactions.find(tx => tx.ticker === ticker);
          const currency = sample?.usdCost != null ? 'USD' : 'TWD';
          await saveStockWatchlistItem({
            ticker,
            name: sample?.name || ticker,
            currency,
            sortOrder: baseOrder + i,
          });
        }
      }

      const addedWatchlistCount = toAdd.length;
      setIsImporting(false);
      setTimeout(() => {
        let body = SUCCESS_IMPORT_BODY.replace('%d', String(preview.transactions.length));
        if (addedWatchlistCount > 0) {
          body += SUCCESS_WATCHLIST_SUFFIX.replace('%d', String(addedWatchlistCount));
        }
        Alert.alert(SUCCESS_IMPORT_TITLE, body, [
          { text: BTN_OK, onPress: () => navigation.goBack() },
        ]);
      }, IMPORT_SUCCESS_ALERT_DELAY_MS);
    } catch {
      setIsImporting(false);
      Alert.alert('', ERROR_IMPORT_STOCK);
    }
  }

  const loadingOverlayVisible = isParsing || isImporting;
  const loadingMessage = isImporting ? IMPORTING_MSG : PARSING_MSG;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Modal visible={loadingOverlayVisible} transparent animationType="fade">
        <View style={styles.importingOverlay}>
          <View style={styles.importingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.importingText}>{loadingMessage}</Text>
          </View>
        </View>
      </Modal>

      <input
        ref={(el) => {
          fileInputRef.current = el;
        }}
        type="file"
        accept=".csv,text/csv,text/plain"
        style={styles.hiddenInput as React.CSSProperties}
        onChange={handleFileInputChange}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>匯入股票紀錄</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.instructionCard}>
          <Ionicons name="information-circle-outline" size={20} color="#2563eb" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.instructionTitle}>CSV 格式說明</Text>
            <Text style={styles.instructionText}>
              欄位順序：日期, 股票代號, 類型, 股數, 成交價, 幣別, TWD成本, USD成本{'\n\n'}
              • 日期：YYYY-MM-DD（如 2024-01-15）{'\n'}
              • 類型：buy（買入）/ sell（賣出）/ drip（股利再投資）{'\n'}
              • 幣別：TWD 或 USD{'\n'}
              • TWD成本：選填；drip 可留空{'\n'}
              • USD成本：選填，USD 股票才需填
            </Text>
            <Text style={[styles.instructionText, { color: '#dc2626' }]}>
              先下載範本參考格式，再整理你的資料匯入
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.templateBtn} onPress={handleDownloadStockTemplate}>
          <Ionicons name="document-text-outline" size={20} color="#16a34a" />
          <Text style={styles.templateBtnText}>下載股票範本 CSV</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.pickBtn}
          onPress={handlePickFile}
          disabled={isParsing || isImporting}
        >
          <Ionicons name="document-outline" size={22} color="#fff" />
          <Text style={styles.pickBtnText}>選取 CSV 檔案</Text>
        </TouchableOpacity>

        {preview && !isParsing && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>解析結果預覽</Text>

            {preview.transactions.length === 0 ? (
              <Text style={styles.previewEmpty}>未找到任何可匯入的交易紀錄</Text>
            ) : (
              <>
                <View style={styles.previewStat}>
                  <Text style={styles.previewStatLabel}>找到交易紀錄</Text>
                  <Text style={styles.previewStatVal}>{preview.transactions.length} 筆</Text>
                </View>
                <View style={styles.previewStat}>
                  <Text style={styles.previewStatLabel}>略過（無效）行數</Text>
                  <Text style={styles.previewStatVal}>{preview.skippedRows}</Text>
                </View>

                <Text style={styles.previewSubTitle}>各股票分布</Text>
                {Object.entries(preview.byTicker).map(([t, count]) => (
                  <View key={t} style={styles.tickerRow}>
                    <Text style={styles.tickerLabel}>{t}</Text>
                    <Text style={styles.tickerCount}>{count} 筆</Text>
                  </View>
                ))}

                {preview.errors.length > 0 && (
                  <View style={styles.errorsBox}>
                    <Text style={styles.errorsTitle}>注意 {preview.errors.length} 個警告</Text>
                    {preview.errors.slice(0, 5).map((err, i) => (
                      <Text key={i} style={styles.errorText}>
                        {err}
                      </Text>
                    ))}
                  </View>
                )}

                <Text style={styles.previewSubTitle}>前 5 筆</Text>
                {preview.transactions.slice(0, 5).map(tx => (
                  <View key={tx.id} style={styles.sampleRow}>
                    <Text style={styles.sampleDate}>{tx.date}</Text>
                    <Text style={styles.sampleTicker} numberOfLines={1}>
                      {tx.ticker}
                    </Text>
                    <Text style={styles.sampleShares}>
                      {tx.shares} 股
                    </Text>
                    <Text style={styles.sampleCost}>NT${tx.twdCost.toFixed(0)}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.confirmBtn, isImporting && styles.confirmBtnDisabled]}
                  onPress={handleConfirmImport}
                  disabled={isImporting}
                >
                  <Text style={styles.confirmBtnText}>確認匯入 {preview.transactions.length} 筆</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  importingOverlay: {
    flex: 1,
    backgroundColor: OVERLAY_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importingBox: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 200,
  },
  importingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
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
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
  },
  scroll: { padding: 16, gap: 16 },
  instructionCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  instructionTitle: { fontSize: 14, fontWeight: '600', color: '#1e40af', marginBottom: 4 },
  instructionText: { fontSize: 13, color: '#374151', lineHeight: 20 },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: '#f0fdf4',
  },
  templateBtnText: { fontSize: 15, fontWeight: '600', color: '#16a34a' },
  pickBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  pickBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  previewEmpty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  previewStat: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewStatLabel: { fontSize: 13, color: '#6b7280' },
  previewStatVal: { fontSize: 14, fontWeight: '600', color: '#111827' },
  previewSubTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 },
  tickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  tickerLabel: { fontSize: 13, fontWeight: '500', color: '#374151' },
  tickerCount: { fontSize: 13, color: '#6b7280' },
  errorsBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  errorsTitle: { fontSize: 12, fontWeight: '600', color: '#dc2626' },
  errorText: { fontSize: 11, color: '#991b1b' },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  sampleDate: { width: PREVIEW_ROW_DATE_WIDTH, fontSize: 12, color: '#374151' },
  sampleTicker: {
    minWidth: PREVIEW_ROW_TICKER_MIN_WIDTH,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  sampleShares: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
    paddingRight: PREVIEW_ROW_SHARES_TAIL_PADDING,
  },
  sampleCost: {
    minWidth: PREVIEW_ROW_COST_MIN_WIDTH,
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
