/**
 * 資料匯入與匯出：匯出記帳 CSV、匯入對方 APP CSV 格式
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useTransactions } from '../contexts/TransactionsContext';
import { useCategories } from '../contexts/CategoriesContext';
import {
  DEFAULT_EXPENSE_CATEGORIES_LIST,
  DEFAULT_INCOME_CATEGORIES_LIST,
} from '../constants';
import {
  getStoredTransactions,
  getStoredAccounts,
  getStoredCategories,
  saveCategories,
  saveTransactions,
  updateStoredAccounts,
} from '../utils/storage';
import {
  parseSourceCsv,
  parsedRowsToTransactions,
  resolveAccountsForImport,
  resolveCategoriesForImport,
  exportTransactionsToCsv,
  type ParsedSourceRow,
} from '../utils/csvImportExport';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const TITLE = '資料匯入與匯出';
const BACK_ICON_SIZE = 28;
const SECTION_EXPORT = '匯出';
const SECTION_IMPORT = '匯入';
const BTN_EXPORT = '匯出記帳資料';
const EXPORT_HINT = '將目前所有記帳匯出為 CSV，可備份或於其他裝置使用。';
const BTN_IMPORT = '匯入記帳資料';
const IMPORT_HINT = '支援本 app 匯出的 CSV 格式（可完整還原收支與轉帳），也相容其他記帳 APP 的 CSV。匯入資料將加入現有記錄。';
const BTN_TEMPLATE = '下載記帳範本 CSV';
const TEMPLATE_HINT = '下載欄位格式範本，按照格式填寫後即可匯入。';

const LEDGER_TEMPLATE_CSV =
  '日期,收支,類別,金額,帳戶,備註,建立時間,轉入帳戶,轉入金額\n' +
  '2024-01-15,支出,飲食,150,現金,午餐,2024-01-15 12:00:00,,\n' +
  '2024-01-16,支出,交通,50,悠遊卡,捷運,2024-01-16 08:30:00,,\n' +
  '2024-01-20,收入,工資,50000,玉山銀行,一月薪水,2024-01-20 09:00:00,,\n' +
  '2024-02-01,轉帳,轉帳,1000,現金,,2024-02-01 10:00:00,玉山銀行,1000\n';
const CONFIRM_IMPORT_TITLE = '確認匯入';
const CONFIRM_IMPORT_MSG = '將匯入 %d 筆，是否加入現有資料？';
const BTN_CANCEL = '取消';
const BTN_OK = '確定';
const SUCCESS_IMPORT = '已成功匯入 %d 筆。';
const SUCCESS_IMPORT_TITLE = '匯入完成';
const IMPORTING_MSG = '正在匯入資料，請稍候…';
/** 關閉載入層後再顯示完成視窗，避免 Alert 被遮擋 */
const IMPORT_SUCCESS_ALERT_DELAY_MS = 300;
const SUCCESS_EXPORT = '已匯出。';
const ERROR_IMPORT = '匯入失敗或無有效資料。';
const ERROR_EXPORT = '匯出失敗。';
const ERROR_NO_FILE = '未選擇檔案。';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'ImportExport'>;

function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ImportExportScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { refreshTransactions } = useTransactions();
  const { getCategoryLabel, refreshCategories } = useCategories();
  const fileInputRef = useRef<{ click: () => void } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const performCsvImport = useCallback(
    async (rows: ParsedSourceRow[]) => {
      setIsImporting(true);
      try {
        const stored = await getStoredCategories();
        const categoriesForResolve =
          stored ?? {
            expense: [...DEFAULT_EXPENSE_CATEGORIES_LIST],
            income: [...DEFAULT_INCOME_CATEGORIES_LIST],
          };
        const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(
          categoriesForResolve,
          rows,
        );
        const existingAccounts = await getStoredAccounts();
        const accountNames = rows.flatMap((r) =>
          r.toAccountName ? [r.accountName, r.toAccountName] : [r.accountName]
        );
        const { accountNameToId, mergedAccounts } = resolveAccountsForImport(
          existingAccounts,
          accountNames,
        );
        const transactions = parsedRowsToTransactions(rows, accountNameToId, resolveCategoryKey);
        const existing = await getStoredTransactions();
        await updateStoredAccounts(mergedAccounts);
        await saveCategories(mergedCategories);
        await saveTransactions([...existing, ...transactions]);
        await refreshTransactions();
        await refreshCategories();
        const count = transactions.length;
        setIsImporting(false);
        setTimeout(() => {
          Alert.alert(SUCCESS_IMPORT_TITLE, SUCCESS_IMPORT.replace('%d', String(count)));
        }, IMPORT_SUCCESS_ALERT_DELAY_MS);
      } catch {
        setIsImporting(false);
        Alert.alert('', ERROR_IMPORT);
      }
    },
    [refreshCategories, refreshTransactions],
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const filename = '記帳匯入範本.csv';
      if (Platform.OS === 'web') {
        const blob = new Blob(['\uFEFF' + LEDGER_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const dir = FileSystemLegacy.cacheDirectory ?? '';
        const path = `${dir}${filename}`;
        await FileSystemLegacy.writeAsStringAsync(path, '\uFEFF' + LEDGER_TEMPLATE_CSV, {
          encoding: FileSystemLegacy.EncodingType.UTF8,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
        }
      }
    } catch {
      Alert.alert('', '範本下載失敗。');
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const [transactions, accounts] = await Promise.all([
        getStoredTransactions(),
        getStoredAccounts(),
      ]);
      const csv = exportTransactionsToCsv(transactions, accounts, getCategoryLabel);
      const filename = `記帳匯出_${getTodayDateString()}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('', SUCCESS_EXPORT);
      } else {
        const dir = FileSystemLegacy.cacheDirectory ?? '';
        const path = `${dir}${filename}`;
        await FileSystemLegacy.writeAsStringAsync(path, csv, {
          encoding: FileSystemLegacy.EncodingType.UTF8,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
        }
        Alert.alert('', SUCCESS_EXPORT);
      }
    } catch {
      Alert.alert('', ERROR_EXPORT);
    }
  }, [getCategoryLabel]);

  const runImport = useCallback(
    async (csvText: string) => {
      const rows = parseSourceCsv(csvText);
      if (rows.length === 0) {
        Alert.alert('', ERROR_IMPORT);
        return;
      }
      if (Platform.OS === 'web') {
        const ok = window.confirm(CONFIRM_IMPORT_MSG.replace('%d', String(rows.length)));
        if (!ok) return;
      }
      await performCsvImport(rows);
    },
    [performCsvImport],
  );

  const handleImportWeb = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        runImport(text);
      };
      reader.readAsText(file, 'UTF-8');
    },
    [runImport],
  );

  const handleImportNative = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'text/plain',
        ],
        copyToCacheDirectory: false,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      const uri = asset?.uri;
      if (!uri) {
        Alert.alert('', ERROR_NO_FILE);
        return;
      }
      const cacheDir = FileSystemLegacy.cacheDirectory ?? '';
      const safeName = (asset.name ?? 'import.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
      const cachePath = `${cacheDir}import_${Date.now()}_${safeName}`;
      await FileSystemLegacy.copyAsync({ from: uri, to: cachePath });
      const text = await FileSystemLegacy.readAsStringAsync(cachePath, {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      const rows = parseSourceCsv(text);
      if (rows.length === 0) {
        Alert.alert('', ERROR_IMPORT);
        return;
      }
      Alert.alert(
        CONFIRM_IMPORT_TITLE,
        CONFIRM_IMPORT_MSG.replace('%d', String(rows.length)),
        [
          { text: BTN_CANCEL, style: 'cancel' },
          {
            text: BTN_OK,
            onPress: async () => {
              await performCsvImport(rows);
            },
          },
        ]
      );
    } catch {
      Alert.alert('', ERROR_IMPORT);
    }
  }, [performCsvImport]);

  const handleImportPress = useCallback(() => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
    } else {
      handleImportNative();
    }
  }, [handleImportNative]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Modal visible={isImporting} transparent animationType="fade">
        <View style={styles.importingOverlay}>
          <View style={styles.importingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.importingText}>{IMPORTING_MSG}</Text>
          </View>
        </View>
      </Modal>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
      </View>

      {Platform.OS === 'web' && (
        <input
          ref={(el) => {
            (fileInputRef as React.MutableRefObject<unknown>).current = el;
          }}
          type="file"
          accept=".csv"
          style={styles.hiddenInput as React.CSSProperties}
          onChange={handleImportWeb}
        />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{SECTION_EXPORT}</Text>
          <TouchableOpacity style={styles.card} onPress={handleExport} activeOpacity={0.7}>
            <Ionicons name="download-outline" size={24} color="#2563eb" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{BTN_EXPORT}</Text>
              <Text style={styles.cardHint}>{EXPORT_HINT}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{SECTION_IMPORT}</Text>
          <TouchableOpacity style={styles.card} onPress={handleDownloadTemplate} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={24} color="#16a34a" />
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: '#16a34a' }]}>{BTN_TEMPLATE}</Text>
              <Text style={styles.cardHint}>{TEMPLATE_HINT}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
          <View style={{ height: 10 }} />
          <TouchableOpacity style={styles.card} onPress={handleImportPress} activeOpacity={0.7}>
            <Ionicons name="document-attach-outline" size={24} color="#2563eb" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{BTN_IMPORT}</Text>
              <Text style={styles.cardHint}>{IMPORT_HINT}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  importingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: { paddingVertical: 8, paddingRight: 16 },
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
  },
  cardText: { flex: 1, marginLeft: 12, marginRight: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  cardHint: { fontSize: 13, color: '#6b7280', marginTop: 4 },
});
