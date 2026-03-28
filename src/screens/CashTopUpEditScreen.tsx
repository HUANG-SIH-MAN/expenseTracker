import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { Account, CashTopUpRule } from '../types';
import { generateId } from '../utils/id';
import { getCashTopUpRules, getStoredAccounts, saveCashTopUpRules } from '../utils/storage';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增現金自動補充';
const TITLE_EDIT = '編輯現金自動補充';
const BTN_SAVE = '儲存';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CashTopUpEdit'>;
type RouteProps = NativeStackScreenProps<MainStackParamList, 'CashTopUpEdit'>['route'];

interface Draft {
  targetAccountId: string;
  sourceAccountId: string;
  thresholdStr: string;
  topUpAmountStr: string;
  isEnabled: boolean;
}

export default function CashTopUpEditScreen(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const ruleId = route.params?.ruleId;
  const isEdit = ruleId != null;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<CashTopUpRule[]>([]);
  const [draft, setDraft] = useState<Draft>({
    targetAccountId: '',
    sourceAccountId: '',
    thresholdStr: '',
    topUpAmountStr: '',
    isEnabled: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storedAccounts, storedRules] = await Promise.all([
        getStoredAccounts(),
        getCashTopUpRules(),
      ]);
      if (cancelled) return;
      setAccounts(storedAccounts.filter((a) => !a.isDeleted));
      setRules(storedRules);
      if (isEdit) {
        const existing = storedRules.find((r) => r.id === ruleId);
        if (existing != null) {
          setDraft({
            targetAccountId: existing.targetAccountId,
            sourceAccountId: existing.sourceAccountId,
            thresholdStr: String(existing.threshold),
            topUpAmountStr: String(existing.topUpAmount),
            isEnabled: existing.isEnabled,
          });
        }
      } else {
        const firstId = storedAccounts[0]?.id ?? '';
        const secondId = storedAccounts[1]?.id ?? firstId;
        setDraft((prev) => ({ ...prev, targetAccountId: firstId, sourceAccountId: secondId }));
      }
      setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [isEdit, ruleId]);

  const thresholdNum = parseFloat(draft.thresholdStr);
  const topUpAmountNum = parseFloat(draft.topUpAmountStr);

  const thresholdError =
    draft.thresholdStr === '' || isNaN(thresholdNum) || thresholdNum <= 0
      ? '請輸入大於 0 的數字'
      : null;
  const topUpAmountError =
    draft.topUpAmountStr === '' || isNaN(topUpAmountNum) || topUpAmountNum <= 0
      ? '請輸入大於 0 的數字'
      : null;
  const sameAccountError =
    draft.targetAccountId !== '' && draft.targetAccountId === draft.sourceAccountId
      ? '現金帳戶與來源帳戶不可相同'
      : null;

  const validationError = thresholdError ?? topUpAmountError ?? sameAccountError ??
    (draft.targetAccountId === '' ? '請選擇現金帳戶' : null) ??
    (draft.sourceAccountId === '' ? '請選擇來源帳戶' : null);

  const canSave = loaded && validationError == null;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const nowIso = new Date().toISOString();
    const existing = rules.find((r) => r.id === ruleId);
    const nextRule: CashTopUpRule = {
      id: existing?.id ?? generateId(),
      targetAccountId: draft.targetAccountId,
      sourceAccountId: draft.sourceAccountId,
      threshold: thresholdNum,
      topUpAmount: topUpAmountNum,
      isEnabled: draft.isEnabled,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    const nextRules = existing
      ? rules.map((r) => (r.id === existing.id ? nextRule : r))
      : [...rules, nextRule];
    await saveCashTopUpRules(nextRules);
    navigation.goBack();
  }, [canSave, draft, thresholdNum, topUpAmountNum, rules, ruleId, navigation]);

  const accountsForDisplay = useMemo(() => accounts.filter((a) => a.name.trim() !== ''), [accounts]);

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? TITLE_EDIT : TITLE_ADD}</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={!canSave}>
          <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>{BTN_SAVE}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>現金帳戶（被補充）</Text>
        <View style={styles.chipWrap}>
          {accountsForDisplay.map((account) => {
            const isSelected = draft.targetAccountId === account.id;
            return (
              <TouchableOpacity
                key={`target-${account.id}`}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, targetAccountId: account.id }))}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{account.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>來源帳戶（提款自）</Text>
        <View style={styles.chipWrap}>
          {accountsForDisplay.map((account) => {
            const isSelected = draft.sourceAccountId === account.id;
            return (
              <TouchableOpacity
                key={`source-${account.id}`}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, sourceAccountId: account.id }))}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{account.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {sameAccountError != null && (
          <Text style={styles.fieldError}>{sameAccountError}</Text>
        )}

        <Text style={styles.label}>觸發門檻（低於此金額時補充）</Text>
        <TextInput
          style={[styles.input, thresholdError != null && styles.inputError]}
          keyboardType="decimal-pad"
          placeholder="例如：1000"
          placeholderTextColor="#9ca3af"
          value={draft.thresholdStr}
          onChangeText={(v) => setDraft((prev) => ({ ...prev, thresholdStr: v.replace(/[^0-9.]/g, '') }))}
        />
        {thresholdError != null && <Text style={styles.fieldError}>{thresholdError}</Text>}

        <Text style={styles.label}>每次補充金額</Text>
        <TextInput
          style={[styles.input, topUpAmountError != null && styles.inputError]}
          keyboardType="decimal-pad"
          placeholder="例如：2000"
          placeholderTextColor="#9ca3af"
          value={draft.topUpAmountStr}
          onChangeText={(v) => setDraft((prev) => ({ ...prev, topUpAmountStr: v.replace(/[^0-9.]/g, '') }))}
        />
        {topUpAmountError != null && <Text style={styles.fieldError}>{topUpAmountError}</Text>}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>啟用規則</Text>
          <Switch
            value={draft.isEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, isEnabled: value }))}
          />
        </View>

        {validationError != null && thresholdError == null && topUpAmountError == null && sameAccountError == null && (
          <Text style={styles.errorText}>{validationError}</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
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
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1f2937' },
  saveBtn: { paddingVertical: 8, paddingLeft: 16 },
  saveText: { fontSize: 16, fontWeight: '600', color: '#2563eb' },
  saveTextDisabled: { color: '#9ca3af' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  label: {
    fontSize: 14, fontWeight: '600', color: '#374151',
    marginBottom: 8, marginTop: 16,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#1f2937', backgroundColor: '#fff',
  },
  inputError: { borderColor: '#dc2626' },
  fieldError: { marginTop: 4, color: '#dc2626', fontSize: 12 },
  switchRow: {
    marginTop: 20, paddingHorizontal: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  switchLabel: { fontSize: 15, color: '#374151', fontWeight: '600' },
  errorText: { marginTop: 12, color: '#dc2626', fontSize: 13 },
});
