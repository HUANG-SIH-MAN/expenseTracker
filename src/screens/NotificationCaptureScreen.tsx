/**
 * Phase 0 除錯頁：通知擷取
 * - 顯示/開啟 Android「通知存取權」
 * - 列出已擷取到的原始通知（驗證能否讀到 LINE / 銀行通知並觀察格式）
 * 僅 Android 有作用；iOS / Web 顯示不支援訊息。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from '../notificationListener';
import {
  getCapturedNotifications,
  clearCapturedNotifications,
  type CapturedNotification,
} from '../utils/notificationCapture';

const TITLE = '通知擷取（測試）';
const IS_ANDROID = Platform.OS === 'android';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'NotificationCapture'>;

const STATUS_LABEL: Record<NotificationPermissionStatus, string> = {
  authorized: '已授權',
  denied: '未授權',
  unknown: '未知',
};

const STATUS_COLOR: Record<NotificationPermissionStatus, string> = {
  authorized: '#16a34a',
  denied: '#dc2626',
  unknown: '#6b7280',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function NotificationCaptureScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [status, setStatus] = useState<NotificationPermissionStatus>('unknown');
  const [items, setItems] = useState<CapturedNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, list] = await Promise.all([
        getNotificationPermissionStatus(),
        getCapturedNotifications(200),
      ]);
      setStatus(s);
      setItems(list);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 從系統設定頁返回時自動刷新授權狀態
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleClear = useCallback(() => {
    const doClear = async () => {
      await clearCapturedNotifications();
      await refresh();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('清除所有已擷取的通知紀錄？')) doClear();
      return;
    }
    Alert.alert('清除紀錄', '清除所有已擷取的通知紀錄？', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: doClear },
    ]);
  }, [refresh]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
        <TouchableOpacity onPress={handleClear} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color="#dc2626" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {!IS_ANDROID && (
          <View style={styles.card}>
            <Text style={styles.cardText}>此功能僅支援 Android。</Text>
          </View>
        )}

        {IS_ANDROID && (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.cardLabel}>通知存取權</Text>
              <Text style={[styles.statusValue, { color: STATUS_COLOR[status] }]}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
            <Text style={styles.hint}>
              需在系統「通知存取權」中允許本 App，才能讀到 LINE / 銀行的通知。
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={requestNotificationPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>開啟通知存取權設定</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.listHeader}>
          <Text style={styles.listHeaderText}>已擷取 {items.length} 則</Text>
          <Text style={styles.listHeaderHint}>下拉重新整理</Text>
        </View>

        {items.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              尚無紀錄。授權後，傳一則 LINE 訊息給自己，再下拉重新整理。
            </Text>
          </View>
        )}

        {items.map((n) => (
          <View key={n.id} style={styles.notifCard}>
            <View style={styles.notifTop}>
              <Text style={styles.notifApp} numberOfLines={1}>
                {n.app ?? '(無 app)'}
              </Text>
              <Text style={styles.notifTime}>{formatTime(n.capturedAt)}</Text>
            </View>
            {n.title != null && n.title !== '' && (
              <Text style={styles.notifTitle}>{n.title}</Text>
            )}
            {n.text != null && n.text !== '' && (
              <Text style={styles.notifText}>{n.text}</Text>
            )}
            {n.bigText != null && n.bigText !== '' && n.bigText !== n.text && (
              <Text style={styles.notifBig}>{n.bigText}</Text>
            )}
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  cardText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  statusValue: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 18 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  listHeaderText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  listHeaderHint: { fontSize: 12, color: '#9ca3af' },
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  notifTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifApp: { fontSize: 12, color: '#2563eb', fontWeight: '600', flex: 1, marginRight: 8 },
  notifTime: { fontSize: 12, color: '#9ca3af' },
  notifTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937', marginTop: 2 },
  notifText: { fontSize: 14, color: '#374151', marginTop: 2, lineHeight: 20 },
  notifBig: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
});
