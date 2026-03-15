/**
 * 幣別管理：內建幣別列表 + 自訂幣別（可新增、刪除）
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import {
  getCustomCurrencies,
  saveCustomCurrencies,
  getCurrencyOptions,
  type CustomCurrencyItem,
} from '../utils/storage';
import { BUILT_IN_CURRENCY_CODES, CURRENCY_LABELS } from '../constants';

const TITLE = '幣別管理';
const BACK_ICON_SIZE = 28;
const SECTION_BUILT_IN = '內建幣別';
const SECTION_CUSTOM = '自訂幣別';
const BTN_ADD = '新增幣別';
const LABEL_CODE = '代碼（如 AUD）';
const LABEL_NAME = '顯示名稱（如 澳幣）';
const PLACEHOLDER_CODE = 'AUD';
const PLACEHOLDER_NAME = '澳幣';
const BTN_SAVE = '儲存';
const BTN_CANCEL = '取消';
const DELETE_CONFIRM_TITLE = '刪除此幣別？';
const DELETE_CONFIRM_MSG = '若已有帳戶使用此幣別，刪除後仍會保留該帳戶的幣別設定。';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CurrencySettings'>;

export default function CurrencySettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [options, setOptions] = useState<{ code: string; label: string; isBuiltIn: boolean }[]>([]);
  const [customList, setCustomList] = useState<CustomCurrencyItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [opts, custom] = await Promise.all([
      getCurrencyOptions(),
      getCustomCurrencies(),
    ]);
    setOptions(opts);
    setCustomList(custom);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = useCallback(async () => {
    const code = newCode.trim().toUpperCase();
    const label = newLabel.trim() || code;
    if (!code) return;
    const builtInSet = new Set(BUILT_IN_CURRENCY_CODES);
    if (builtInSet.has(code)) {
      Alert.alert('無法新增', '此代碼為內建幣別，無須重複新增。');
      return;
    }
    const existing = customList.find((c) => c.code.toUpperCase() === code);
    if (existing) {
      Alert.alert('無法新增', '此代碼已存在，請編輯或刪除後再新增。');
      return;
    }
    setSaving(true);
    try {
      await saveCustomCurrencies([...customList, { code, label }]);
      setNewCode('');
      setNewLabel('');
      setShowAddModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }, [newCode, newLabel, customList, load]);

  const handleDelete = useCallback(
    (item: CustomCurrencyItem) => {
      Alert.alert(
        DELETE_CONFIRM_TITLE,
        DELETE_CONFIRM_MSG,
        [
          { text: BTN_CANCEL, style: 'cancel' },
          {
            text: '刪除',
            style: 'destructive',
            onPress: async () => {
              await saveCustomCurrencies(
                customList.filter((c) => c.code.toUpperCase() !== item.code.toUpperCase())
              );
              await load();
            },
          },
        ]
      );
    },
    [customList, load]
  );

  const builtInOptions = options.filter((o) => o.isBuiltIn);
  const customOptions = options.filter((o) => !o.isBuiltIn);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>{SECTION_BUILT_IN}</Text>
        <View style={styles.list}>
          {BUILT_IN_CURRENCY_CODES.map((code) => (
            <View key={code} style={styles.row}>
              <Text style={styles.rowText}>{CURRENCY_LABELS[code] ?? code}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{SECTION_CUSTOM}</Text>
        {customOptions.length === 0 ? (
          <Text style={styles.hint}>尚未新增自訂幣別</Text>
        ) : (
          <View style={styles.list}>
            {customOptions.map((o) => (
              <View key={o.code} style={styles.row}>
                <Text style={styles.rowText}>{o.label}</Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete({ code: o.code, label: o.label })}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{BTN_ADD}</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{LABEL_CODE}</Text>
              <TextInput
                style={styles.input}
                placeholder={PLACEHOLDER_CODE}
                placeholderTextColor="#9ca3af"
                value={newCode}
                onChangeText={(t) => setNewCode(t.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6))}
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{LABEL_NAME}</Text>
              <TextInput
                style={styles.input}
                placeholder={PLACEHOLDER_NAME}
                placeholderTextColor="#9ca3af"
                value={newLabel}
                onChangeText={setNewLabel}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAddModal(false);
                  setNewCode('');
                  setNewLabel('');
                }}
              >
                <Text style={styles.modalCancelText}>{BTN_CANCEL}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && styles.modalSaveBtnDisabled]}
                onPress={handleAdd}
                disabled={saving || !newCode.trim()}
              >
                <Text style={styles.modalSaveText}>{saving ? '儲存中…' : BTN_SAVE}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: { paddingVertical: 8, paddingRight: 16 },
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    marginTop: 16,
  },
  list: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowText: { fontSize: 16, color: '#374151' },
  deleteBtn: { padding: 8 },
  hint: { fontSize: 14, color: '#9ca3af', marginTop: 8 },
  addBtn: {
    marginTop: 24,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16, color: '#1f2937' },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 16, color: '#6b7280' },
  modalSaveBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalSaveBtnDisabled: { backgroundColor: '#9ca3af' },
  modalSaveText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
