import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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
import type { Account, TransactionType, TransferTemplate, TransferTemplateLinkedTx } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { getTransferTemplates, saveTransferTemplate, getStoredAccounts } from '../utils/storage';
import { generateId } from '../utils/id';

const BACK_ICON_SIZE = 28;
const TITLE_ADD = '新增轉帳模板';
const TITLE_EDIT = '編輯轉帳模板';
const BTN_SAVE = '儲存';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'TransferTemplateEdit'>;
type RouteProps = NativeStackScreenProps<MainStackParamList, 'TransferTemplateEdit'>['route'];

const INCOME_COLOR = { bg: '#dcfce7', text: '#166534' };
const EXPENSE_COLOR = { bg: '#fee2e2', text: '#991b1b' };

function TypeBadge({ type }: { type: 'income' | 'expense' }) {
  const color = type === 'income' ? INCOME_COLOR : EXPENSE_COLOR;
  const label = type === 'income' ? '收入' : '支出';
  return (
    <View style={[styles.typeBadge, { backgroundColor: color.bg }]}>
      <Text style={[styles.typeBadgeText, { color: color.text }]}>{label}</Text>
    </View>
  );
}

export default function TransferTemplateEditScreen(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const templateId = route.params?.templateId;
  const isEdit = templateId != null;

  const { expenseCategories, incomeCategories, getCategoryLabel } = useCategories();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Template fields
  const [name, setName] = useState('');
  const [fromAccountId, setFromAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [defaultAmountStr, setDefaultAmountStr] = useState('');
  const [linkedTxs, setLinkedTxs] = useState<TransferTemplateLinkedTx[]>([]);

  // Inline add linked tx form
  const [showLinkedForm, setShowLinkedForm] = useState(false);
  const [formType, setFormType] = useState<TransactionType>('income');
  const [formAmountStr, setFormAmountStr] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formNote, setFormNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storedAccounts, templates] = await Promise.all([
        getStoredAccounts(),
        getTransferTemplates(),
      ]);
      if (cancelled) return;
      setAccounts(storedAccounts.filter((a) => !a.isDeleted));
      if (templateId != null) {
        const existing = templates.find((t) => t.id === templateId);
        if (existing) {
          setName(existing.name);
          setFromAccountId(existing.fromAccountId ?? '');
          setToAccountId(existing.toAccountId ?? '');
          setDefaultAmountStr(existing.defaultAmount != null ? String(existing.defaultAmount) : '');
          setLinkedTxs(existing.linkedTransactions);
        }
      }
      setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [templateId]);

  const canSave = name.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const template: TransferTemplate = {
      id: templateId ?? generateId(),
      name: name.trim(),
      fromAccountId: fromAccountId || undefined,
      toAccountId: toAccountId || undefined,
      defaultAmount: defaultAmountStr !== '' ? parseFloat(defaultAmountStr) : undefined,
      linkedTransactions: linkedTxs,
      createdAt: now,
      updatedAt: now,
    };
    await saveTransferTemplate(template);
    navigation.goBack();
  }, [canSave, templateId, name, fromAccountId, toAccountId, defaultAmountStr, linkedTxs, navigation]);

  const handleAddLinkedTx = useCallback(() => {
    const amount = parseFloat(formAmountStr);
    if (isNaN(amount) || amount <= 0 || formCategory === '') return;
    const newTx: TransferTemplateLinkedTx = {
      type: formType as 'income' | 'expense',
      amount,
      category: formCategory,
      accountId: formAccountId || undefined,
      note: formNote.trim() || undefined,
    };
    setLinkedTxs((prev) => [...prev, newTx]);
    setFormAmountStr('');
    setFormCategory('');
    setFormAccountId('');
    setFormNote('');
    setShowLinkedForm(false);
  }, [formType, formAmountStr, formCategory, formAccountId, formNote]);

  const categories = formType === 'income' ? incomeCategories : expenseCategories;

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
          </TouchableOpacity>
          <Text style={styles.title}>{isEdit ? TITLE_EDIT : TITLE_ADD}</Text>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>{BTN_SAVE}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* 模板名稱 */}
          <Text style={styles.sectionLabel}>模板名稱</Text>
          <View style={styles.inputBlock}>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="例：中油Pay儲值"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* 轉出帳戶 */}
          <Text style={styles.sectionLabel}>轉出帳戶（選填）</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, fromAccountId === '' && styles.chipSelected]}
              onPress={() => setFromAccountId('')}
            >
              <Text style={[styles.chipText, fromAccountId === '' && styles.chipTextSelected]}>不設定</Text>
            </TouchableOpacity>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.chip, fromAccountId === a.id && styles.chipSelected]}
                onPress={() => setFromAccountId(a.id)}
              >
                <Text style={[styles.chipText, fromAccountId === a.id && styles.chipTextSelected]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 轉入帳戶 */}
          <Text style={styles.sectionLabel}>轉入帳戶（選填）</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, toAccountId === '' && styles.chipSelected]}
              onPress={() => setToAccountId('')}
            >
              <Text style={[styles.chipText, toAccountId === '' && styles.chipTextSelected]}>不設定</Text>
            </TouchableOpacity>
            {accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.chip, toAccountId === a.id && styles.chipSelected]}
                onPress={() => setToAccountId(a.id)}
              >
                <Text style={[styles.chipText, toAccountId === a.id && styles.chipTextSelected]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 預設金額 */}
          <Text style={styles.sectionLabel}>預設金額（選填）</Text>
          <View style={styles.inputBlock}>
            <TextInput
              style={styles.textInput}
              value={defaultAmountStr}
              onChangeText={setDefaultAmountStr}
              placeholder="例：3000"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />
          </View>

          {/* 附加交易 */}
          <View style={styles.linkedHeader}>
            <Text style={styles.sectionLabel}>附加交易</Text>
            <TouchableOpacity
              style={styles.addLinkedBtn}
              onPress={() => setShowLinkedForm((v) => !v)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
              <Text style={styles.addLinkedBtnText}>新增</Text>
            </TouchableOpacity>
          </View>

          {linkedTxs.length > 0 && (
            <View style={styles.listBlock}>
              {linkedTxs.map((tx, index) => (
                <View key={index} style={[styles.linkedRow, index === linkedTxs.length - 1 && styles.rowLast]}>
                  <TypeBadge type={tx.type} />
                  <View style={styles.linkedRowInfo}>
                    <Text style={styles.linkedRowAmount}>{tx.amount}</Text>
                    <Text style={styles.linkedRowSub}>{getCategoryLabel(tx.type, tx.category)}{tx.note ? `・${tx.note}` : ''}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => setLinkedTxs((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {showLinkedForm && (
            <View style={styles.linkedForm}>
              {/* 類型 */}
              <View style={styles.typeTabs}>
                {(['income', 'expense'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeTab, formType === t && styles.typeTabSelected]}
                    onPress={() => { setFormType(t); setFormCategory(''); }}
                  >
                    <Text style={[styles.typeTabText, formType === t && styles.typeTabTextSelected]}>
                      {t === 'income' ? '收入' : '支出'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 金額 */}
              <Text style={styles.formLabel}>金額</Text>
              <View style={styles.inputBlock}>
                <TextInput
                  style={styles.textInput}
                  value={formAmountStr}
                  onChangeText={setFormAmountStr}
                  placeholder="例：120"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
              </View>

              {/* 類別 */}
              <Text style={styles.formLabel}>類別</Text>
              <View style={styles.chipRow}>
                {categories.filter((c) => !c.deleted).map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.chip, formCategory === c.key && styles.chipSelected]}
                    onPress={() => setFormCategory(c.key)}
                  >
                    <Text style={[styles.chipText, formCategory === c.key && styles.chipTextSelected]}>
                      {c.icon} {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 帳戶 */}
              <Text style={styles.formLabel}>帳戶（選填）</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, formAccountId === '' && styles.chipSelected]}
                  onPress={() => setFormAccountId('')}
                >
                  <Text style={[styles.chipText, formAccountId === '' && styles.chipTextSelected]}>不設定</Text>
                </TouchableOpacity>
                {accounts.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.chip, formAccountId === a.id && styles.chipSelected]}
                    onPress={() => setFormAccountId(a.id)}
                  >
                    <Text style={[styles.chipText, formAccountId === a.id && styles.chipTextSelected]}>{a.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 備註 */}
              <Text style={styles.formLabel}>備註（選填）</Text>
              <View style={styles.inputBlock}>
                <TextInput
                  style={styles.textInput}
                  value={formNote}
                  onChangeText={setFormNote}
                  placeholder="例：回饋金"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.addLinkedConfirmBtn,
                  (formAmountStr === '' || formCategory === '') && styles.addLinkedConfirmBtnDisabled,
                ]}
                onPress={handleAddLinkedTx}
                disabled={formAmountStr === '' || formCategory === ''}
              >
                <Text style={styles.addLinkedConfirmBtnText}>加入附加交易</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
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
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937', flex: 1 },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: { backgroundColor: '#e5e7eb' },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saveBtnTextDisabled: { color: '#9ca3af' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 16, marginBottom: 8 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 6 },
  inputBlock: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
  },
  textInput: {
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextSelected: { color: '#2563eb', fontWeight: '600' },
  linkedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  addLinkedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLinkedBtnText: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  listBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginBottom: 8,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLast: { borderBottomWidth: 0 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  linkedRowInfo: { flex: 1 },
  linkedRowAmount: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  linkedRowSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  linkedForm: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 8,
  },
  typeTabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  typeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  typeTabSelected: { backgroundColor: '#eff6ff' },
  typeTabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  typeTabTextSelected: { color: '#2563eb' },
  addLinkedConfirmBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  addLinkedConfirmBtnDisabled: { backgroundColor: '#e5e7eb' },
  addLinkedConfirmBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
