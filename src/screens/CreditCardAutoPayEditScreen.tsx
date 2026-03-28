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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { Account, CreditCardAutoPayRule } from '../types';
import { generateId } from '../utils/id';
import { getCreditCardAutoPayRules, getStoredAccounts, saveCreditCardAutoPayRules } from '../utils/storage';
import {
  AUTO_PAY_MIN_DAY,
  validateAutoPayDraft,
  type AutoPayRuleDraft,
} from './creditCardAutoPayUi';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增自動扣款規則';
const TITLE_EDIT = '編輯自動扣款規則';
const BTN_SAVE = '儲存';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CreditCardAutoPayEdit'>;
type RouteProps = NativeStackScreenProps<MainStackParamList, 'CreditCardAutoPayEdit'>['route'];

export default function CreditCardAutoPayEditScreen(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const ruleId = route.params?.ruleId;
  const isEdit = ruleId != null;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<CreditCardAutoPayRule[]>([]);
  const [draft, setDraft] = useState<AutoPayRuleDraft>({
    creditCardAccountId: '',
    payFromAccountId: '',
    statementDay: AUTO_PAY_MIN_DAY,
    paymentDay: AUTO_PAY_MIN_DAY,
    isEnabled: true,
  });
  const [statementDayStr, setStatementDayStr] = useState(String(AUTO_PAY_MIN_DAY));
  const [paymentDayStr, setPaymentDayStr] = useState(String(AUTO_PAY_MIN_DAY));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storedAccounts, storedRules] = await Promise.all([
        getStoredAccounts(),
        getCreditCardAutoPayRules(),
      ]);
      if (cancelled) return;
      setAccounts(storedAccounts);
      setRules(storedRules);
      if (isEdit) {
        const existing = storedRules.find((item) => item.id === ruleId);
        if (existing != null) {
          setDraft({
            creditCardAccountId: existing.creditCardAccountId,
            payFromAccountId: existing.payFromAccountId,
            statementDay: existing.statementDay,
            paymentDay: existing.paymentDay,
            isEnabled: existing.isEnabled && existing.deletedAt == null,
          });
          setStatementDayStr(String(existing.statementDay));
          setPaymentDayStr(String(existing.paymentDay));
        }
      } else {
        const firstAccountId = storedAccounts[0]?.id ?? '';
        const secondAccountId = storedAccounts[1]?.id ?? firstAccountId;
        setDraft((prev) => ({
          ...prev,
          creditCardAccountId: firstAccountId,
          payFromAccountId: secondAccountId,
        }));
      }
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, ruleId]);

  const statementDayNum = Number(statementDayStr);
  const paymentDayNum = Number(paymentDayStr);
  const statementDayError =
    statementDayStr === '' || !Number.isInteger(statementDayNum) || statementDayNum < 1 || statementDayNum > 28
      ? '請輸入 1 到 28 的整數'
      : null;
  const paymentDayError =
    paymentDayStr === '' || !Number.isInteger(paymentDayNum) || paymentDayNum < 1 || paymentDayNum > 28
      ? '請輸入 1 到 28 的整數'
      : null;

  const draftWithDays: AutoPayRuleDraft = {
    ...draft,
    statementDay: statementDayError == null ? statementDayNum : -1,
    paymentDay: paymentDayError == null ? paymentDayNum : -1,
  };

  const validation = useMemo(
    () => validateAutoPayDraft(draftWithDays, rules, ruleId),
    [draftWithDays, rules, ruleId],
  );

  const canSave = loaded && statementDayError == null && paymentDayError == null && validation.isValid;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const nowIso = new Date().toISOString();
    const existing = rules.find((item) => item.id === ruleId);
    const nextRule: CreditCardAutoPayRule = {
      id: existing?.id ?? generateId(),
      creditCardAccountId: draft.creditCardAccountId,
      payFromAccountId: draft.payFromAccountId,
      statementDay: statementDayNum,
      paymentDay: paymentDayNum,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      isEnabled: draft.isEnabled,
      deletedAt: existing?.deletedAt,
      deleteReason: existing?.deleteReason,
    };
    const nextRules = existing
      ? rules.map((item) => (item.id === existing.id ? nextRule : item))
      : [...rules, nextRule];
    await saveCreditCardAutoPayRules(nextRules);
    navigation.goBack();
  }, [canSave, draft, navigation, ruleId, rules]);

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
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
        <Text style={styles.label}>信用卡帳戶</Text>
        <View style={styles.chipWrap}>
          {accounts.map((account) => {
            const isSelected = draft.creditCardAccountId === account.id;
            return (
              <TouchableOpacity
                key={`credit-${account.id}`}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, creditCardAccountId: account.id }))}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{account.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>扣款來源帳戶</Text>
        <View style={styles.chipWrap}>
          {accounts.map((account) => {
            const isSelected = draft.payFromAccountId === account.id;
            return (
              <TouchableOpacity
                key={`source-${account.id}`}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => setDraft((prev) => ({ ...prev, payFromAccountId: account.id }))}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{account.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>結帳日（1-28）</Text>
        <TextInput
          style={[styles.input, statementDayError != null && styles.inputError]}
          keyboardType="number-pad"
          value={statementDayStr}
          onChangeText={(v) => setStatementDayStr(v.replace(/[^0-9]/g, ''))}
        />
        {statementDayError != null && (
          <Text style={styles.fieldError}>{statementDayError}</Text>
        )}

        <Text style={styles.label}>扣款日（1-28）</Text>
        <TextInput
          style={[styles.input, paymentDayError != null && styles.inputError]}
          keyboardType="number-pad"
          value={paymentDayStr}
          onChangeText={(v) => setPaymentDayStr(v.replace(/[^0-9]/g, ''))}
        />
        {paymentDayError != null && (
          <Text style={styles.fieldError}>{paymentDayError}</Text>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>啟用規則</Text>
          <Switch
            value={draft.isEnabled}
            onValueChange={(value) => setDraft((prev) => ({ ...prev, isEnabled: value }))}
          />
        </View>

        {!validation.isValid && validation.message != null ? (
          <Text style={styles.errorText}>{validation.message}</Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
  backBtn: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveBtn: {
    paddingVertical: 8,
    paddingLeft: 16,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  saveTextDisabled: {
    color: '#9ca3af',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  switchRow: {
    marginTop: 20,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  fieldError: {
    marginTop: 4,
    color: '#dc2626',
    fontSize: 12,
  },
  errorText: {
    marginTop: 12,
    color: '#dc2626',
    fontSize: 13,
  },
});
