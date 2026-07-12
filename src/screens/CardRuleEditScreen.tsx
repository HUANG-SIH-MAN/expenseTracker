/**
 * 編輯一條刷卡自動記帳規則：名稱、末四碼、關鍵字、對應帳戶、預設類別。
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredAccounts } from '../utils/storage';
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

export default function CardRuleEditScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const ruleId = route.params?.ruleId;
  const { expenseCategories } = useCategories();

  const [rule, setRule] = useState<CardRule | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    getStoredAccounts().then((list) =>
      setAccounts(list.filter((a) => a.name.trim() !== '' && !a.isDeleted)),
    );
  }, []);

  useEffect(() => {
    if (!ruleId) {
      getCardRules().then((rules) => setRule(newCardRule(rules.length)));
      return;
    }
    getCardRules().then((rules) => {
      const found = rules.find((r) => r.id === ruleId);
      setRule(found ?? newCardRule(rules.length));
    });
  }, [ruleId]);

  const accountName = useMemo(
    () => accounts.find((a) => a.id === rule?.accountId)?.name ?? null,
    [accounts, rule?.accountId],
  );
  const categoryLabel = useMemo(
    () => expenseCategories.find((c) => c.key === rule?.categoryKey)?.label ?? null,
    [expenseCategories, rule?.categoryKey],
  );

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
        <Text style={styles.fieldLabel}>名稱</Text>
        <TextInput
          style={styles.input}
          value={rule.label}
          onChangeText={(t) => update({ label: t })}
          placeholder="台新 / 永豐 / 富邦…"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.fieldLabel}>末四碼（最準，通知有卡號時填）</Text>
        <TextInput
          style={styles.input}
          value={rule.matchLast4 ?? ''}
          onChangeText={(t) => update({ matchLast4: t.replace(/\D/g, '').slice(0, 4) || null })}
          placeholder="例如 7509"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          maxLength={4}
        />

        <Text style={styles.fieldLabel}>關鍵字（沒卡號時用，比對通知內容）</Text>
        <TextInput
          style={styles.input}
          value={rule.matchKeyword ?? ''}
          onChangeText={(t) => update({ matchKeyword: t.trim() || null })}
          placeholder="例如 永豐、富邦"
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.fieldLabel}>對應帳戶</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setShowAccountPicker(true)}>
          <Text style={[styles.selectorValue, !accountName && styles.selectorPlaceholder]}>
            {accountName ?? '未綁定（記為現金）'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>預設類別</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setShowCategoryPicker(true)}>
          <Text style={[styles.selectorValue, !categoryLabel && styles.selectorPlaceholder]}>
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

      <PickerModal
        visible={showAccountPicker}
        title="選擇帳戶"
        onClose={() => setShowAccountPicker(false)}
        options={[
          { key: '', label: '未綁定（記為現金）' },
          ...accounts.map((a) => ({ key: a.id, label: a.name })),
        ]}
        selectedKey={rule.accountId ?? ''}
        onSelect={(k) => {
          update({ accountId: k || null });
          setShowAccountPicker(false);
        }}
      />
      <PickerModal
        visible={showCategoryPicker}
        title="選擇預設類別"
        onClose={() => setShowCategoryPicker(false)}
        options={expenseCategories.map((c) => ({ key: c.key, label: `${c.icon} ${c.label}` }))}
        selectedKey={rule.categoryKey ?? ''}
        onSelect={(k) => {
          update({ categoryKey: k || null });
          setShowCategoryPicker(false);
        }}
      />
    </View>
  );
}

function PickerModal({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((o) => (
              <TouchableOpacity key={o.key} style={styles.modalRow} onPress={() => onSelect(o.key)}>
                <Text style={styles.modalRowText}>{o.label}</Text>
                {o.key === selectedKey ? (
                  <Ionicons name="checkmark" size={20} color="#2563eb" />
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  },
  selectorValue: { fontSize: 16, color: '#1f2937' },
  selectorPlaceholder: { color: '#9ca3af' },
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
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, width: 320 },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 8 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  modalRowText: { fontSize: 16, color: '#1f2937' },
});
