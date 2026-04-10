/**
 * 自選股清單設定：新增 / 編輯 / 刪除常用股票
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
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getStockWatchlist,
  saveStockWatchlistItem,
  deleteStockWatchlistItem,
} from '../utils/storage';
import { getStockPrice } from '../utils/stockPrice';
import type { StockWatchlistItem, StockCurrency } from '../types';

type ModalState =
  | { mode: 'add' }
  | { mode: 'edit'; item: StockWatchlistItem };

export default function StockWatchlistSettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [list, setList] = useState<StockWatchlistItem[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<StockCurrency>('USD');
  const [validating, setValidating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getStockWatchlist().then(setList);
    }, [])
  );

  function openAdd() {
    setTicker('');
    setName('');
    setCurrency('USD');
    setModal({ mode: 'add' });
  }

  function openEdit(item: StockWatchlistItem) {
    setTicker(item.ticker);
    setName(item.name);
    setCurrency(item.currency);
    setModal({ mode: 'edit', item });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleDelete(item: StockWatchlistItem) {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`確定要從常用清單移除「${item.ticker}」嗎？`)
      : await new Promise<boolean>(resolve =>
          Alert.alert('刪除股票', `確定要從常用清單移除「${item.ticker}」嗎？`, [
            { text: '取消', style: 'cancel', onPress: () => resolve(false) },
            { text: '刪除', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;
    await deleteStockWatchlistItem(item.ticker);
    setList(prev => prev.filter(i => i.ticker !== item.ticker));
  }

  async function handleSave() {
    const t = ticker.trim().toUpperCase();
    const n = name.trim();
    if (!t) return Alert.alert('請輸入股票代號');

    // 驗證股票是否存在
    setValidating(true);
    try {
      const result = await getStockPrice(t, currency, true);
      if (result == null) {
        Alert.alert('找不到此股票', `無法驗證「${t}」，請確認代號與幣別是否正確。`);
        return;
      }
    } finally {
      setValidating(false);
    }

    const existing = list.find(i => i.ticker === t);
    if (modal?.mode === 'add' && existing) {
      return Alert.alert('重複', `「${t}」已在常用清單中`);
    }

    const item: StockWatchlistItem = {
      ticker: t,
      name: n || t,
      currency,
      sortOrder: modal?.mode === 'edit' ? (modal.item.sortOrder) : list.length,
    };

    await saveStockWatchlistItem(item);
    const updated = await getStockWatchlist();
    setList(updated);
    closeModal();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>自選股清單</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Ionicons name="add" size={26} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {list.length === 0 && (
          <Text style={styles.empty}>清單為空，點右上角 + 新增股票</Text>
        )}
        {list.map(item => (
          <View key={item.ticker} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTicker}>{item.ticker}</Text>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={styles.rowRight}>
              <View style={[styles.badge, item.currency === 'USD' ? styles.badgeUSD : styles.badgeTWD]}>
                <Text style={styles.badgeText}>{item.currency}</Text>
              </View>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                <Ionicons name="pencil-outline" size={18} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={closeModal}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeModal} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>{modal?.mode === 'edit' ? '編輯股票' : '新增股票'}</Text>

          <Text style={styles.fieldLabel}>股票代號</Text>
          <TextInput
            style={[styles.input, modal?.mode === 'edit' && styles.inputDisabled]}
            value={ticker}
            onChangeText={t => setTicker(t.toUpperCase())}
            placeholder="NVDA / 006208"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            editable={modal?.mode !== 'edit'}
          />

          <Text style={styles.fieldLabel}>顯示名稱（選填）</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="留空則顯示代號"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.fieldLabel}>幣別</Text>
          <View style={styles.currencyRow}>
            {(['USD', 'TWD'] as StockCurrency[]).map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.currencyBtnText, currency === c && styles.currencyBtnTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, validating && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={validating}
          >
            {validating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>驗證並儲存</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
            <Text style={styles.cancelBtnText}>取消</Text>
          </TouchableOpacity>
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
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#111827' },
  addBtn: { padding: 4 },
  scroll: { padding: 16, gap: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  rowLeft: { flex: 1 },
  rowTicker: { fontSize: 15, fontWeight: '700', color: '#111827' },
  rowName: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeUSD: { backgroundColor: '#dbeafe' },
  badgeTWD: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  iconBtn: { padding: 4 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#374151' },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
  },
  inputDisabled: { color: '#9ca3af', backgroundColor: '#f3f4f6' },
  currencyRow: { flexDirection: 'row', gap: 10 },
  currencyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  currencyBtnActive: { backgroundColor: '#2563eb' },
  currencyBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  currencyBtnTextActive: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: '#6b7280', fontSize: 15 },
});
