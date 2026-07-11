/**
 * Phase 3：待確認消費清單。
 * 進頁時掃描新通知 → 解析去重 → 顯示；使用者可「確認」（帶到記一筆畫面）或「忽略」。
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
import {
  syncNotificationsToPending,
  getPendingTransactions,
  dismissPending,
  type PendingTransaction,
} from '../utils/pendingTransactions';

const TITLE = '待確認消費';
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

function buildNote(p: PendingTransaction): string {
  const parts = [p.bank];
  if (p.merchant) parts.push(p.merchant);
  if (p.last4) parts.push(`(${p.last4})`);
  return parts.join(' ');
}

export default function PendingTransactionsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<PendingTransaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNotificationsToPending();
      setItems(await getPendingTransactions());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleConfirm = useCallback(
    (p: PendingTransaction) => {
      navigation.navigate('AddTransaction', {
        selectedDate: toDateKey(p.occurredAt),
        prefillAmount: p.amount,
        prefillNote: buildNote(p),
        prefillCategoryKey: p.defaultCategoryKey ?? undefined,
        pendingId: p.id,
      });
    },
    [navigation],
  );

  const handleDismiss = useCallback(
    (p: PendingTransaction) => {
      const doDismiss = async () => {
        await dismissPending(p.id);
        await load();
      };
      if (Platform.OS === 'web') {
        if (window.confirm('忽略這筆消費？')) doDismiss();
        return;
      }
      Alert.alert('忽略消費', `忽略「${buildNote(p)} $${p.amount}」？`, [
        { text: '取消', style: 'cancel' },
        { text: '忽略', style: 'destructive', onPress: doDismiss },
      ]);
    },
    [load],
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

        <Text style={styles.countText}>共 {items.length} 筆待確認</Text>

        {items.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              目前沒有待確認的消費。刷卡後銀行/LINE 通知進來，會自動出現在這裡。
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
              {p.merchant ?? '（無商店名，確認時可自行補）'}
              {p.last4 ? `　末四碼 ${p.last4}` : ''}
            </Text>
            <View style={styles.itemActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.dismissBtn]}
                onPress={() => handleDismiss(p)}
                activeOpacity={0.8}
              >
                <Text style={styles.dismissText}>忽略</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.confirmBtn]}
                onPress={() => handleConfirm(p)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>確認記帳</Text>
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
  dismissBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dismissText: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#2563eb' },
  confirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
