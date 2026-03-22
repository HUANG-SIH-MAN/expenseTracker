/**
 * 資料匯入與匯出（Web）：僅使用 Blob 匯出與 file input 匯入，不引用 expo-file-system / expo-sharing，避免 Metro 解析錯誤。
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
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

const TITLE = '資料匯入與匯出';
const BACK_ICON_SIZE = 28;
const SECTION_EXPORT = '匯出';
const SECTION_IMPORT = '匯入';
const BTN_EXPORT = '匯出記帳資料';
const EXPORT_HINT = '將目前所有記帳匯出為 CSV，可備份或於其他裝置使用。';
const BTN_IMPORT = '匯入記帳資料';
const IMPORT_HINT = '從其他記帳 APP 匯出的 CSV（欄位：日期,大類別,類別,金額,帳戶,備註,收支等）可匯入，將加入現有資料。';
const CONFIRM_IMPORT_MSG = '將匯入 %d 筆，是否加入現有資料？';
const SUCCESS_IMPORT = '已成功匯入 %d 筆。';
const SUCCESS_IMPORT_TITLE = '匯入完成';
const IMPORTING_MSG = '正在匯入資料，請稍候…';
const IMPORT_SUCCESS_ALERT_DELAY_MS = 300;
const SUCCESS_EXPORT = '已匯出。';
const ERROR_IMPORT = '匯入失敗或無有效資料。';
const ERROR_EXPORT = '匯出失敗。';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        const accountNames = rows.map((r) => r.accountName);
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

  const handleExport = useCallback(async () => {
    try {
      const [transactions, accounts] = await Promise.all([
        getStoredTransactions(),
        getStoredAccounts(),
      ]);
      const csv = exportTransactionsToCsv(transactions, accounts, getCategoryLabel);
      const filename = `記帳匯出_${getTodayDateString()}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      Alert.alert('', SUCCESS_EXPORT);
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
      const ok = window.confirm(CONFIRM_IMPORT_MSG.replace('%d', String(rows.length)));
      if (!ok) return;
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

  const handleImportPress = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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

      <input
        ref={(el) => {
          fileInputRef.current = el;
        }}
        type="file"
        accept=".csv"
        style={styles.hiddenInput as React.CSSProperties}
        onChange={handleImportWeb}
      />

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
