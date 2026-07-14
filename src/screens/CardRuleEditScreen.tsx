/**
 * 編輯一條刷卡自動記帳規則：名稱、對應銀行 App（可手動輸入自訂）、末四碼、帳戶、預設類別。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredAccounts } from '../utils/storage';
import { getDetectedApps, type DetectedApp } from '../utils/notificationCapture';
import type { Account } from '../types';
import {
  getCardRules,
  saveCardRule,
  deleteCardRule,
  newCardRule,
  type CardRule,
} from '../utils/cardRules';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CardRuleEdit'>;
type RouteProps = NativeStackScreenProps<MainStackParamList, 'CardRuleEdit'>['route'];

/** 已知 App 的友善名稱（沒偵測到通知時也能顯示得漂亮） */
const KNOWN_APP_NAMES: Record<string, string> = {
  'tw.com.taishinbank.ccapp': '台新 Richart 消費通知',
  'com.sinopac.dawho': '永豐大戶 DAWHO',
};

interface Option {
  key: string;
  label: string;
  sub?: string;
}

export default function CardRuleEditScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const ruleId = route.params?.ruleId;
  const { expenseCategories } = useCategories();

  const [rule, setRule] = useState<CardRule | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [picker, setPicker] = useState<null | 'app' | 'account' | 'category'>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPkg, setManualPkg] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    getStoredAccounts().then((list) =>
      setAccounts(list.filter((a) => a.name.trim() !== '' && !a.isDeleted)),
    );
    getDetectedApps().then(setDetectedApps);
  }, []);

  useEffect(() => {
    getCardRules().then((rules) => {
      const found = ruleId ? rules.find((r) => r.id === ruleId) : undefined;
      setRule(found ?? newCardRule(rules.length));
    });
  }, [ruleId]);

  const appName = useCallback(
    (pkg: string | null): string | null => {
      if (!pkg) return null;
      const d = detectedApps.find((a) => a.package === pkg);
      if (d && d.title) return d.title;
      return KNOWN_APP_NAMES[pkg] ?? pkg;
    },
    [detectedApps],
  );

  const accountName = useMemo(
    () => accounts.find((a) => a.id === rule?.accountId)?.name ?? null,
    [accounts, rule?.accountId],
  );
  const categoryLabel = useMemo(
    () => expenseCategories.find((c) => c.key === rule?.categoryKey)?.label ?? null,
    [expenseCategories, rule?.categoryKey],
  );

  /** App 選單的選項：偵測到的 + 已知的 + 目前選的，去重 */
  const appOptions = useMemo<Option[]>(() => {
    const map = new Map<string, Option>();
    detectedApps.forEach((a) =>
      map.set(a.package, { key: a.package, label: a.title || KNOWN_APP_NAMES[a.package] || a.package, sub: a.package }),
    );
    Object.entries(KNOWN_APP_NAMES).forEach(([pkg, name]) => {
      if (!map.has(pkg)) map.set(pkg, { key: pkg, label: name, sub: pkg });
    });
    if (rule?.matchApp && !map.has(rule.matchApp)) {
      map.set(rule.matchApp, { key: rule.matchApp, label: appName(rule.matchApp) ?? rule.matchApp, sub: rule.matchApp });
    }
    return Array.from(map.values());
  }, [detectedApps, rule?.matchApp, appName]);

  const update = useCallback((patch: Partial<CardRule>) => {
    setRule((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!rule) return;
    if (rule.label.trim() === '') {
      const msg = '請輸入名稱（例如：台新、永豐、富邦）';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('缺少名稱', msg);
      return;
    }
    await saveCardRule({ ...rule, label: rule.label.trim() });
    navigation.goBack();
  }, [rule, navigation]);

  const handleDelete = useCallback(() => {
    if (!ruleId) return;
    const doDelete = async () => {
      await deleteCardRule(ruleId);
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('刪除這條規則？')) doDelete();
      return;
    }
    Alert.alert('刪除規則', '刪除這條規則？', [
      { text: '取消', style: 'cancel' },
      { text: '刪除', style: 'destructive', onPress: doDelete },
    ]);
  }, [ruleId, navigation]);

  const confirmManual = useCallback(() => {
    const pkg = manualPkg.trim();
    const nm = manualName.trim();
    if (pkg.indexOf('.') <= 0 || nm === '') return;
    setRule((prev) => (prev ? { ...prev, matchApp: pkg, label: prev.label || nm } : prev));
    setManualOpen(false);
    setManualPkg('');
    setManualName('');
  }, [manualPkg, manualName]);

  if (!rule) {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.title}>{ruleId ? '編輯規則' : '新增規則'}</Text>
        <TouchableOpacity onPress={handleSave} hitSlop={8}>
          <Text style={styles.saveText}>儲存</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.fieldLabel}>名稱（顯示用）</Text>
        <TextInput
          style={styles.input}
          value={rule.label}
          onChangeText={(t) => update({ label: t })}
          placeholder="台新 / 永豐 / 富邦…"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.fieldLabel}>對應的銀行 App</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setPicker('app')}>
          <View style={styles.selectorLeft}>
            <Text style={[styles.selectorValue, !rule.matchApp && styles.placeholder]}>
              {appName(rule.matchApp) ?? '尚未選擇'}
            </Text>
            {rule.matchApp ? <Text style={styles.selectorSub}>{rule.matchApp}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
        <Text style={styles.help}>刷卡通知從哪個 App 來，這是最主要的比對依據。</Text>

        <Text style={styles.fieldLabel}>末四碼（選填）</Text>
        <TextInput
          style={styles.input}
          value={rule.matchLast4 ?? ''}
          onChangeText={(t) => update({ matchLast4: t.replace(/\D/g, '').slice(0, 4) || null })}
          placeholder="例如 7509，同 App 多張卡才需要"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={4}
        />

        <Text style={styles.sectionLabel}>記帳時套用</Text>

        <Text style={styles.fieldLabel}>記到哪個帳戶</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setPicker('account')}>
          <Text style={[styles.selectorValue, !accountName && styles.placeholder]}>
            {accountName ?? '未綁定（記為現金）'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>預設類別</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setPicker('category')}>
          <Text style={[styles.selectorValue, !categoryLabel && styles.placeholder]}>
            {categoryLabel ?? '未設定'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>

        {ruleId ? (
          <TouchableOpacity style={styles.deleteRow} onPress={handleDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={styles.deleteText}>刪除這條規則</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* App 選單 */}
      <PickerSheet
        visible={picker === 'app'}
        title="選擇銀行 App"
        options={appOptions}
        selectedKey={rule.matchApp ?? ''}
        onSelect={(k) => {
          update({ matchApp: k, label: rule.label || (appName(k) ?? '') });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        extraLabel="＋ 手動輸入其他 App"
        onExtra={() => {
          setPicker(null);
          setManualOpen(true);
        }}
        footnote="LINE（jp.naver.line.android）已被忽略，不列在這裡。"
      />

      {/* 帳戶選單 */}
      <PickerSheet
        visible={picker === 'account'}
        title="記到哪個帳戶"
        options={[
          { key: '', label: '未綁定（記為現金）' },
          ...accounts.map((a) => ({ key: a.id, label: a.name })),
        ]}
        selectedKey={rule.accountId ?? ''}
        onSelect={(k) => {
          update({ accountId: k || null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />

      {/* 類別選單 */}
      <PickerSheet
        visible={picker === 'category'}
        title="預設類別"
        options={expenseCategories.map((c) => ({ key: c.key, label: `${c.icon} ${c.label}` }))}
        selectedKey={rule.categoryKey ?? ''}
        onSelect={(k) => {
          update({ categoryKey: k || null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />

      {/* 手動輸入 App */}
      <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          style={styles.manualOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.manualCard}>
              <Text style={styles.modalTitle}>手動輸入 App</Text>
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  不知道套件名稱？去「設定 → 通知擷取（測試）」，看該 App 通知上方那行
                  com.xxx.yyy 就是，貼進來即可。
                </Text>
              </View>
              <Text style={styles.fieldLabel}>App 套件名稱</Text>
              <TextInput
                style={[styles.input, styles.mono]}
                value={manualPkg}
                onChangeText={setManualPkg}
                placeholder="com.xxx.yyy"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldLabel}>顯示名稱</Text>
              <TextInput
                style={styles.input}
                value={manualName}
                onChangeText={setManualName}
                placeholder="例如 中信、玉山"
                placeholderTextColor="#9ca3af"
              />
              <View style={styles.manualBtns}>
                <TouchableOpacity style={[styles.manualBtn, styles.manualCancel]} onPress={() => setManualOpen(false)}>
                  <Text style={styles.manualCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.manualBtn, styles.manualConfirm, (manualPkg.indexOf('.') <= 0 || !manualName.trim()) && styles.manualDisabled]}
                  onPress={confirmManual}
                  disabled={manualPkg.indexOf('.') <= 0 || !manualName.trim()}
                >
                  <Text style={styles.manualConfirmText}>加入並選用</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function PickerSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  extraLabel,
  onExtra,
  footnote,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  extraLabel?: string;
  onExtra?: () => void;
  footnote?: string;
}): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {options.map((o) => (
              <TouchableOpacity key={o.key} style={styles.optRow} onPress={() => onSelect(o.key)}>
                <View style={styles.optLead}>
                  <Text style={styles.optLabel}>{o.label}</Text>
                  {o.sub ? <Text style={styles.optSub}>{o.sub}</Text> : null}
                </View>
                {o.key === selectedKey ? <Ionicons name="checkmark" size={20} color="#2563eb" /> : null}
              </TouchableOpacity>
            ))}
            {extraLabel && onExtra ? (
              <TouchableOpacity style={styles.optRow} onPress={onExtra}>
                <Text style={styles.optExtra}>{extraLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
          {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  saveText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  body: { padding: 16 },
  fieldLabel: { fontSize: 13, color: '#6b7280', marginTop: 16, marginBottom: 6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#9ca3af',
    marginTop: 22,
  },
  help: { fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 17 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 14 },
  selector: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorLeft: { flex: 1, minWidth: 0 },
  selectorValue: { fontSize: 16, color: '#1f2937' },
  selectorSub: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }) },
  placeholder: { color: '#9ca3af' },
  deleteRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  deleteText: { fontSize: 15, color: '#dc2626', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // 有輸入框的 modal：用 KeyboardAvoidingView + ScrollView，鍵盤跳出時把卡片往上推、
  // 並可捲動，避免輸入框被鍵盤蓋住（置中與內距移到 ScrollView 的 contentContainer）。
  manualOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheetCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 8 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  optLead: { flex: 1, minWidth: 0 },
  optLabel: { fontSize: 16, color: '#1f2937' },
  optSub: { fontSize: 11, color: '#9ca3af', marginTop: 2, fontFamily: Platform.select({ android: 'monospace', default: 'monospace' }) },
  optExtra: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  footnote: { fontSize: 11.5, color: '#9ca3af', marginTop: 10, lineHeight: 16 },
  tipBox: { backgroundColor: '#eaf0ff', borderRadius: 10, padding: 11, marginBottom: 6 },
  tipText: { fontSize: 12, color: '#2563eb', lineHeight: 17 },
  manualCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360 },
  manualBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  manualBtn: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center' },
  manualCancel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  manualCancelText: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  manualConfirm: { backgroundColor: '#2563eb' },
  manualConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  manualDisabled: { opacity: 0.45 },
});
