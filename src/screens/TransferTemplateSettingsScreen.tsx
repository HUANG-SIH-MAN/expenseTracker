import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { Account, TransferTemplate } from '../types';
import { getTransferTemplates, deleteTransferTemplate, getStoredAccounts } from '../utils/storage';

const TITLE = '轉帳模板';
const BACK_ICON_SIZE = 28;
const BTN_ADD = '新增轉帳模板';
const EMPTY_HINT = '尚無轉帳模板，可點下方按鈕新增';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'TransferTemplateSettings'>;

export default function TransferTemplateSettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [templates, setTemplates] = useState<TransferTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const accountNameMap = useMemo(() => {
    return accounts.reduce<Record<string, string>>((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const loadData = useCallback(async () => {
    const [storedTemplates, storedAccounts] = await Promise.all([
      getTransferTemplates(),
      getStoredAccounts(),
    ]);
    setTemplates(storedTemplates);
    setAccounts(storedAccounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleDelete = useCallback(async (id: string) => {
    await deleteTransferTemplate(id);
    setPendingDeleteId(null);
    await loadData();
  }, [loadData]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {templates.length === 0 ? (
          <Text style={styles.emptyHint}>{EMPTY_HINT}</Text>
        ) : (
          <View style={styles.listBlock}>
            {templates.map((template, index) => {
              const fromName = template.fromAccountId
                ? (accountNameMap[template.fromAccountId] ?? template.fromAccountId)
                : '未設定';
              const toName = template.toAccountId
                ? (accountNameMap[template.toAccountId] ?? template.toAccountId)
                : '未設定';
              const isLast = index === templates.length - 1;
              return (
                <View key={template.id} style={[styles.row, isLast && styles.rowLast]}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('TransferTemplateEdit', { templateId: template.id })}
                  >
                    <Text style={styles.rowTitle} numberOfLines={1}>{template.name}</Text>
                    <Text style={styles.rowSubTitle} numberOfLines={1}>
                      {fromName} → {toName}
                    </Text>
                    {template.linkedTransactions.length > 0 && (
                      <Text style={styles.rowSubTitle}>
                        附加交易：{template.linkedTransactions.length} 筆
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    hitSlop={8}
                    onPress={() => setPendingDeleteId(template.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('TransferTemplateEdit', {})}
        >
          <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>
      </ScrollView>

      {pendingDeleteId != null && (
        <View style={[styles.confirmBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.confirmText}>確定要刪除此模板？</Text>
          <View style={styles.confirmBtns}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnCancel]}
              onPress={() => setPendingDeleteId(null)}
            >
              <Text style={styles.confirmBtnCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmBtnDelete]}
              onPress={() => handleDelete(pendingDeleteId)}
            >
              <Text style={styles.confirmBtnDeleteText}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  title: { fontSize: 18, fontWeight: '600', color: '#1f2937', flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  emptyHint: { fontSize: 14, color: '#6b7280', textAlign: 'center', paddingVertical: 24 },
  listBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLast: { borderBottomWidth: 0 },
  rowContent: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  rowSubTitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  deleteBtn: { padding: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 16, fontWeight: '600', color: '#2563eb' },
  confirmBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  confirmText: { fontSize: 15, color: '#1f2937', marginBottom: 12, textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  confirmBtnCancel: { backgroundColor: '#f3f4f6' },
  confirmBtnDelete: { backgroundColor: '#fee2e2' },
  confirmBtnCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  confirmBtnDeleteText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});
