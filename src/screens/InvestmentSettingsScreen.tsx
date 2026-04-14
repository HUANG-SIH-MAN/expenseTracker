/**
 * 投資設定頁
 * - Alpha Vantage API Key 管理（用於 ETF 持股資料）
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { AlphaVantageApiKeyEntry } from '../types';
import { getAlphaVantageApiKeys, setAlphaVantageApiKeys } from '../utils/storage';
import { useInvestment } from '../contexts/InvestmentContext';

const HEADER_HEIGHT = 48;
const BOTTOM_PADDING = 24;
const INPUT_FOCUS_SCROLL_DELAY_MS = 160;
const DEFAULT_INPUT_HEIGHT = 44;
const API_KEY_PREVIEW_LIMIT = 3;

type InvestmentSettingsNav = NativeStackNavigationProp<MainStackParamList, 'InvestmentSettings'>;

function parseApiKeysInput(raw: string): string[] {
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const line of raw.split('\n')) {
    const key = line.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push(key);
  }
  return parsed;
}

function formatApiKeysInput(keys: string[]): string {
  return keys.join('\n');
}

function areKeyListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function isBlockedEntry(entry: AlphaVantageApiKeyEntry): boolean {
  if (!entry.blockedUntil) return false;
  const blockedUntilMs = new Date(entry.blockedUntil).getTime();
  return Number.isFinite(blockedUntilMs) && blockedUntilMs > Date.now();
}

function formatBlockedUntil(blockedUntil?: string): string {
  if (!blockedUntil) return '';
  const blockedUntilMs = new Date(blockedUntil).getTime();
  if (!Number.isFinite(blockedUntilMs)) return '';
  return new Date(blockedUntilMs).toLocaleString('zh-TW', { hour12: false });
}

export default function InvestmentSettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<InvestmentSettingsNav>();
  const { positions, removeAllTransactionsByTicker } = useInvestment();

  const [apiKeysInput, setApiKeysInput] = useState('');
  const [savedKeyEntries, setSavedKeyEntries] = useState<AlphaVantageApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [contentVisibleHeight, setContentVisibleHeight] = useState(0);
  const [inputLayout, setInputLayout] = useState({ y: 0, height: DEFAULT_INPUT_HEIGHT });

  useEffect(() => {
    getAlphaVantageApiKeys().then(entries => {
      setApiKeysInput(formatApiKeysInput(entries.map((entry) => entry.key)));
      setSavedKeyEntries(entries);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    const parsedKeys = parseApiKeysInput(apiKeysInput);
    if (parsedKeys.length === 0) {
      const msg = '請輸入 API Key';
      if (Platform.OS === 'web') { window.alert(msg); return; }
      Alert.alert('', msg);
      return;
    }
    setSaving(true);
    await setAlphaVantageApiKeys(parsedKeys);
    const refreshedEntries = await getAlphaVantageApiKeys();
    setApiKeysInput(formatApiKeysInput(refreshedEntries.map((entry) => entry.key)));
    setSavedKeyEntries(refreshedEntries);
    setSaving(false);
    const msg = `已儲存 ${refreshedEntries.length} 組 API Key`;
    if (Platform.OS === 'web') { window.alert(msg); return; }
    Alert.alert('', msg);
  }

  function handleDeleteStockData(ticker: string) {
    const doDelete = async () => {
      await removeAllTransactionsByTicker(ticker);
      const msg = `已刪除 ${ticker} 所有交易紀錄`;
      if (Platform.OS === 'web') { window.alert(msg); return; }
      Alert.alert('', msg);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`確定要刪除 ${ticker} 的所有資料嗎？此操作無法復原。`)) doDelete();
      return;
    }
    Alert.alert(
      `刪除 ${ticker} 所有資料`,
      '所有交易紀錄將被永久刪除，此操作無法復原。',
      [
        { text: '取消', style: 'cancel' },
        { text: '刪除', style: 'destructive', onPress: doDelete },
      ]
    );
  }

  function handleClear() {
    const doClear = async () => {
      await setAlphaVantageApiKeys([]);
      setApiKeysInput('');
      setSavedKeyEntries([]);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('確定要清除 API Key 嗎？')) doClear();
      return;
    }
    Alert.alert('清除 API Key', '確定要清除嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: doClear },
    ]);
  }

  const currentKeys = parseApiKeysInput(apiKeysInput);
  const savedKeys = savedKeyEntries.map((entry) => entry.key);
  const isDirty = !areKeyListsEqual(currentKeys, savedKeys);
  const activeKeyCount = savedKeyEntries.filter((entry) => !isBlockedEntry(entry)).length;
  const previewEntries = savedKeyEntries.slice(0, API_KEY_PREVIEW_LIMIT);
  const hasMorePreview = savedKeyEntries.length > API_KEY_PREVIEW_LIMIT;

  function handleApiKeyFocus() {
    const inputCenterY = inputLayout.y + inputLayout.height / 2;
    const targetOffsetY = Math.max(0, inputCenterY - contentVisibleHeight / 2);

    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: targetOffsetY, animated: true });
    }, INPUT_FOCUS_SCROLL_DELAY_MS);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>投資設定</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.contentContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
        onLayout={event => setContentVisibleHeight(event.nativeEvent.layout.height)}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + BOTTOM_PADDING }]}
          >
            {/* Alpha Vantage 說明區塊 */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('ImportStock')}
              >
                <View style={styles.linkRowContent}>
                  <Text style={styles.linkRowTitle}>股票交易匯入</Text>
                  <Text style={styles.linkRowSubtitle}>從 CSV 匯入投資交易紀錄</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Alpha Vantage API Key</Text>
              <Text style={styles.sectionDesc}>
                用於抓取 ETF 持股明細（QQQ、SMH）。{'\n'}
                免費方案每日 25 次，支援多組 key 輪替。{'\n'}
                某組達上限會先封鎖 24 小時，系統自動切換下一組可用 key。
              </Text>

              <View style={styles.stepBox}>
                <Text style={styles.stepTitle}>如何取得免費 API Key</Text>
                <Text style={styles.stepText}>
                  1. 點選下方連結前往官網{'\n'}
                  2. 點選「Get Free API Key」{'\n'}
                  3. 填入 Email（不需信用卡）{'\n'}
                  4. 複製 Key 貼到下方欄位
                </Text>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => Linking.openURL('https://www.alphavantage.co/support/#api-key')}
                >
                  <Ionicons name="open-outline" size={14} color="#2563eb" />
                  <Text style={styles.linkText}>前往 alphavantage.co 申請</Text>
                </TouchableOpacity>
              </View>

              {/* 輸入欄 */}
              <Text style={styles.inputLabel}>API Keys（每行一組）</Text>
              <View
                style={styles.inputRow}
                onLayout={event => {
                  const { y, height } = event.nativeEvent.layout;
                  setInputLayout({ y, height });
                }}
              >
                <TextInput
                  style={styles.input}
                  value={apiKeysInput}
                  onChangeText={setApiKeysInput}
                  onFocus={handleApiKeyFocus}
                  placeholder={`貼上你的 Alpha Vantage API Key\n每行一組`}
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  multiline
                  numberOfLines={4}
                  scrollEnabled
                  blurOnSubmit={false}
                  returnKeyType="default"
                />
                {apiKeysInput.length > 0 && (
                  <TouchableOpacity style={styles.clearBtn} onPress={() => setApiKeysInput('')}>
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>

              {/* 狀態標籤 */}
              {savedKeyEntries.length > 0 ? (
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <Text style={styles.statusSaved}>
                    已設定 {savedKeyEntries.length} 組（目前可用 {activeKeyCount} 組）
                  </Text>
                </View>
              ) : (
                <View style={styles.statusRow}>
                  <Ionicons name="warning-outline" size={14} color="#d97706" />
                  <Text style={styles.statusEmpty}>尚未設定，ETF 持股資料無法顯示</Text>
                </View>
              )}

              {previewEntries.map((entry) => (
                <View key={entry.key} style={styles.keyItemRow}>
                  <Text style={styles.keyItemText}>{maskApiKey(entry.key)}</Text>
                  {isBlockedEntry(entry) ? (
                    <Text style={styles.keyBlockedText}>
                      已達上限，{formatBlockedUntil(entry.blockedUntil)} 後可用
                    </Text>
                  ) : (
                    <Text style={styles.keyActiveText}>可用</Text>
                  )}
                </View>
              ))}
              {hasMorePreview && (
                <Text style={styles.moreText}>尚有 {savedKeyEntries.length - API_KEY_PREVIEW_LIMIT} 組未顯示</Text>
              )}

              {/* 儲存按鈕 */}
              <TouchableOpacity
                style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!isDirty || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>儲存</Text>
                )}
              </TouchableOpacity>

              {/* 清除按鈕 */}
              {savedKeyEntries.length > 0 && (
                <TouchableOpacity style={styles.clearKeyBtn} onPress={handleClear}>
                  <Text style={styles.clearKeyBtnText}>清除 API Key</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 刪除單一股票資料 */}
            {positions.size > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>刪除股票所有資料</Text>
                <Text style={styles.sectionDesc}>刪除後所有交易紀錄將永久消失，無法復原。</Text>
                {Array.from(positions.values()).map((pos, index, arr) => (
                  <View
                    key={pos.ticker}
                    style={[
                      styles.deleteStockRow,
                      index === arr.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View>
                      <Text style={styles.deleteStockTicker}>{pos.ticker}</Text>
                      {pos.name !== pos.ticker && (
                        <Text style={styles.deleteStockName}>{pos.name}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteStockBtn}
                      onPress={() => handleDeleteStockData(pos.ticker)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#dc2626" />
                      <Text style={styles.deleteStockBtnText}>刪除</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  contentContainer: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { padding: 16, gap: 16 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  linkRowContent: {
    flex: 1,
    marginRight: 8,
  },
  linkRowTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  linkRowSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionDesc: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
  stepBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  stepTitle: { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  stepText: { fontSize: 12, color: '#0c4a6e', lineHeight: 20 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  linkText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 10,
    minHeight: 96,
    maxHeight: 168,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  clearBtn: { padding: 4, marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusSaved: { fontSize: 12, color: '#16a34a' },
  statusEmpty: { fontSize: 12, color: '#d97706' },
  keyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  keyItemText: { fontSize: 12, color: '#111827', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  keyActiveText: { fontSize: 12, color: '#16a34a' },
  keyBlockedText: { fontSize: 12, color: '#b45309', flex: 1, textAlign: 'right' },
  moreText: { fontSize: 12, color: '#6b7280' },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#93c5fd' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  clearKeyBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  clearKeyBtnText: { fontSize: 13, color: '#dc2626' },
  deleteStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  deleteStockTicker: { fontSize: 14, fontWeight: '600', color: '#111827' },
  deleteStockName: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  deleteStockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  deleteStockBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});
