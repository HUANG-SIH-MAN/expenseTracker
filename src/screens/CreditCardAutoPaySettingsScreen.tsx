import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { Account, CreditCardAutoPayRule } from '../types';
import { getCreditCardAutoPayRules, getStoredAccounts } from '../utils/storage';
import { getRuleStatusMeta } from './creditCardAutoPayUi';

const TITLE = '信用卡自動扣款';
const BACK_ICON_SIZE = 28;
const BTN_ADD = '新增規則';
const EMPTY_HINT = '尚無自動扣款規則，可點下方按鈕新增';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CreditCardAutoPaySettings'>;

export default function CreditCardAutoPaySettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [rules, setRules] = useState<CreditCardAutoPayRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const accountNameMap = useMemo(() => {
    return accounts.reduce<Record<string, string>>((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const loadData = useCallback(async () => {
    const [storedRules, storedAccounts] = await Promise.all([
      getCreditCardAutoPayRules(),
      getStoredAccounts(),
    ]);
    setRules(storedRules);
    setAccounts(storedAccounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
        {rules.length === 0 ? (
          <Text style={styles.emptyHint}>{EMPTY_HINT}</Text>
        ) : (
          <View style={styles.listBlock}>
            {rules.map((rule, index) => {
              const status = getRuleStatusMeta(rule);
              return (
                <TouchableOpacity
                  key={rule.id}
                  style={[styles.row, index === rules.length - 1 && styles.rowLast]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('CreditCardAutoPayEdit', { ruleId: rule.id })}
                >
                  <View style={styles.rowMain}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {accountNameMap[rule.creditCardAccountId] ?? `帳戶 ${rule.creditCardAccountId}`}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: status.backgroundColor }]}>
                        <Text style={[styles.statusText, { color: status.textColor }]}>{status.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.rowSubTitle} numberOfLines={1}>
                      扣款來源：{accountNameMap[rule.payFromAccountId] ?? `帳戶 ${rule.payFromAccountId}`}
                    </Text>
                    <Text style={styles.rowSubTitle}>
                      結帳日 {rule.statementDay} / 扣款日 {rule.paymentDay}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CreditCardAutoPayEdit', {})}
        >
          <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  emptyHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 24,
  },
  listBlock: {
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowMain: {
    flex: 1,
    marginRight: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  rowSubTitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
});
