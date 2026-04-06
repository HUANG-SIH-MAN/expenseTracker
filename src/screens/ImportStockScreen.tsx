/**
 * CSV 匯入頁面
 * 流程：
 *  1. 使用者選取 CSV 檔案（從 Excel 另存）
 *  2. APP 解析並顯示預覽（筆數、各股票明細）
 *  3. 使用者確認後寫入 DB
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useInvestment } from '../contexts/InvestmentContext';
import { importStockCSV } from '../utils/stockImport';
import type { StockTransaction } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function ImportStockScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { importTransactions } = useInvestment();

  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<{
    transactions: StockTransaction[];
    skippedRows: number;
    errors: string[];
    byTicker: Record<string, number>;
  } | null>(null);

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file) return;

      setIsParsing(true);
      setPreview(null);
      try {
        const csvText = await FileSystem.readAsStringAsync(file.uri, {
          encoding: 'utf8' as const,
        });
        const importResult = importStockCSV(csvText);

        // 統計各股票筆數
        const byTicker: Record<string, number> = {};
        for (const tx of importResult.transactions) {
          byTicker[tx.ticker] = (byTicker[tx.ticker] ?? 0) + 1;
        }

        setPreview({
          ...importResult,
          byTicker,
        });
      } catch (e) {
        Alert.alert('解析失敗', '無法讀取 CSV 檔案，請確認檔案格式正確。');
      } finally {
        setIsParsing(false);
      }
    } catch (e) {
      Alert.alert('錯誤', '選取檔案失敗');
    }
  }

  async function handleConfirmImport() {
    if (!preview || preview.transactions.length === 0) return;

    Alert.alert(
      '確認匯入',
      `將匯入 ${preview.transactions.length} 筆交易紀錄，是否繼續？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '匯入',
          onPress: async () => {
            setIsImporting(true);
            try {
              await importTransactions(preview.transactions);
              Alert.alert(
                '匯入成功',
                `已成功匯入 ${preview.transactions.length} 筆交易紀錄。`,
                [{ text: '確定', onPress: () => navigation.goBack() }]
              );
            } catch {
              Alert.alert('匯入失敗', '請稍後再試');
            } finally {
              setIsImporting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>匯入股票紀錄</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {/* 說明 */}
        <View style={styles.instructionCard}>
          <Ionicons name="information-circle-outline" size={20} color="#2563eb" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.instructionTitle}>如何匯入？</Text>
            <Text style={styles.instructionText}>
              1. 打開 Excel 的股票記錄檔{'\n'}
              2. 點選「另存新檔」→ 選「CSV（逗號分隔）」{'\n'}
              3. 回到此頁面點「選取 CSV 檔案」{'\n'}
              4. 預覽確認後點「確認匯入」
            </Text>
            <Text style={[styles.instructionText, { color: '#dc2626' }]}>
              ⚠️ 匯入不會影響現有記帳紀錄
            </Text>
          </View>
        </View>

        {/* 選取按鈕 */}
        <TouchableOpacity
          style={styles.pickBtn}
          onPress={handlePickFile}
          disabled={isParsing || isImporting}
        >
          <Ionicons name="document-outline" size={22} color="#fff" />
          <Text style={styles.pickBtnText}>選取 CSV 檔案</Text>
        </TouchableOpacity>

        {/* 解析中 */}
        {isParsing && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.hint}>解析中…</Text>
          </View>
        )}

        {/* 預覽結果 */}
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
                    {preview.errors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={styles.errorText}>{e}</Text>
                    ))}
                  </View>
                )}

                <Text style={styles.previewSubTitle}>前 5 筆</Text>
                {preview.transactions.slice(0, 5).map(tx => (
                  <View key={tx.id} style={styles.sampleRow}>
                    <Text style={styles.sampleDate}>{tx.date}</Text>
                    <Text style={styles.sampleTicker}>{tx.ticker}</Text>
                    <Text style={styles.sampleShares}>{tx.shares} 股</Text>
                    <Text style={styles.sampleCost}>NT${tx.twdCost.toFixed(0)}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.confirmBtn, isImporting && { opacity: 0.5 }]}
                  onPress={handleConfirmImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>確認匯入 {preview.transactions.length} 筆</Text>
                  )}
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
  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  hint: { fontSize: 13, color: '#6b7280' },
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
    gap: 8,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  sampleDate: { width: 80, fontSize: 12, color: '#374151' },
  sampleTicker: { width: 50, fontSize: 12, fontWeight: '600', color: '#374151' },
  sampleShares: { flex: 1, fontSize: 12, color: '#6b7280' },
  sampleCost: { fontSize: 12, fontWeight: '500', color: '#111827' },
  confirmBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
