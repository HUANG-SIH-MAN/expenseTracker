/**
 * 自動記帳紀錄：顯示由刷卡通知自動記下的交易，可編輯（調整分類/帳戶）或刪除（退款/記錯）。
 * 進頁時先掃一次新通知，確保最新消費也被記進來。
 */
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useTransactions } from '../contexts/TransactionsContext';
import {
  syncNotificationsToTransactions,
  getAutoRecords,
  deleteAutoRecord,
  type PendingTransaction,
} from '../utils/pendingTransactions';

const TITLE = '自動記帳紀錄';
const IS_ANDROID = Platform.OS === 'android';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'PendingTransactions'>;

function toDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PendingTransactionsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { refreshTransactions } = useTransactions();
  const [items, setItems] = useState<PendingTransaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNotificationsToTransactions();
      setItems(await getAutoRecords(200));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleEdit = useCallback(
    (p: PendingTransaction) => {
      if (!p.createdTransactionId) return;
      navigation.navigate('AddTransaction', {
        selectedDate: toDateKey(p.occurredAt),
        transactionId: p.createdTransactionId,
      });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    (p: PendingTransaction) => {
      const doDelete = async () => {
        await deleteAutoRecord(p.id);
        await refreshTransactions();
        await load();
      };
      const label = `${p.bank}${p.merchant ? ' ' + p.merchant : ''} $${p.amount}`;
      if (Platform.OS === 'web') {
        if (window.confirm(`刪除「${label}」這筆帳？`)) doDelete();
        return;
      }
      Alert.alert('刪除這筆帳', `刪除「${label}」？此筆記帳會一併移除。`, [
        { text: '取消', style: 'cancel' },
        { text: '刪除', style: 'destructive', onPress: doDelete },
      ]);
    },
    [load, refreshTransactions],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      >
        {!IS_ANDROID && (
          <View style={styles.card}>
            <Text style={styles.cardText}>此功能僅支援 Android。</Text>
          </View>
        )}

        <Text style={styles.countText}>刷卡通知已自動記帳 {items.length} 筆</Text>

        {items.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              目前沒有自動記帳紀錄。刷卡後銀行/LINE 通知進來，會自動記成一筆，並顯示在這裡。
            </Text>
          </View>
        )}

        {items.map((p) => (
          <View key={p.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <Text style={styles.itemBank}>{p.bank}</Text>
              <Text style={styles.itemWhen}>{formatWhen(p.occurredAt)}</Text>
            </View>
            <Text style={styles.itemAmount}>
              ${p.amount.toLocaleString()} <Text style={styles.itemCurrency}>{p.currency}</Text>
            </Text>
            <Text style={styles.itemMerchant}>
              {p.merchant ?? '（無商店名）'}
              {p.last4 ? `　末四碼 ${p.last4}` : ''}
            </Text>
            <View style={styles.itemActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={() => handleDelete(p)}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteText}>刪除</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.editBtn]}
                onPress={() => handleEdit(p)}
                activeOpacity={0.8}
              >
                <Text style={styles.editText}>編輯分類</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  countText: { fontSize: 13, color: '#6b7280', marginBottom: 10, paddingHorizontal: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  cardText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  itemBank: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  itemWhen: { fontSize: 12, color: '#9ca3af' },
  itemAmount: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  itemCurrency: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  itemMerchant: { fontSize: 14, color: '#374151', marginTop: 4 },
  itemActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteText: { fontSize: 15, color: '#dc2626', fontWeight: '600' },
  editBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  editText: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
});
