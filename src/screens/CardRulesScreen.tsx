/**
 * 刷卡自動記帳設定：管理「卡片/來源規則」——每張卡對應帳戶與預設類別。
 * 綁定優先序：末四碼 > App 套件 > 關鍵字。
 */
import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredAccounts } from '../utils/storage';
import type { Account } from '../types';
import { ensureCardRulesSeeded, getCardRules, type CardRule } from '../utils/cardRules';

const TITLE = '刷卡自動記帳設定';
const IS_ANDROID = Platform.OS === 'android';

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CardRules'>;

export default function CardRulesScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { expenseCategories } = useCategories();
  const [rules, setRules] = useState<CardRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async () => {
    await ensureCardRulesSeeded();
    setRules(await getCardRules());
    setAccounts(await getStoredAccounts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const detailOf = (r: CardRule): string => {
    const parts: string[] = [];
    if (r.matchLast4) parts.push(`末四碼 ${r.matchLast4}`);
    else if (r.matchKeyword) parts.push(`關鍵字「${r.matchKeyword}」`);
    const acc = accounts.find((a) => a.id === r.accountId);
    parts.push(acc ? acc.name : '未綁定帳戶');
    const cat = expenseCategories.find((c) => c.key === r.categoryKey);
    if (cat) parts.push(cat.label);
    return parts.join(' · ');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CardRuleEdit', {})} hitSlop={8}>
          <Ionicons name="add" size={28} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {!IS_ANDROID && (
          <View style={styles.card}>
            <Text style={styles.cardText}>此功能僅支援 Android。</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardText}>
            每張卡設一條規則：刷卡通知進來時，依「末四碼 → App → 關鍵字」對應到帳戶與預設類別，
            自動記帳。新的銀行卡在這裡加一條就好，不用改程式。
          </Text>
        </View>

        {rules.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={styles.ruleRow}
            onPress={() => navigation.navigate('CardRuleEdit', { ruleId: r.id })}
            activeOpacity={0.7}
          >
            <View style={styles.ruleContent}>
              <Text style={styles.ruleLabel}>{r.label || '(未命名)'}</Text>
              <Text style={styles.ruleDetail} numberOfLines={1}>{detailOf(r)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.addRow}
          onPress={() => navigation.navigate('CardRuleEdit', {})}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
          <Text style={styles.addText}>新增一張卡 / 來源</Text>
        </TouchableOpacity>
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
  body: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  cardText: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  ruleRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ruleContent: { flex: 1, marginRight: 8 },
  ruleLabel: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  ruleDetail: { fontSize: 13, color: '#6b7280', marginTop: 3 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  addText: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
});
