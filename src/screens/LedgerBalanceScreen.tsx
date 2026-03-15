/**
 * 帳本餘額頁：顯示每個帳本的目前餘額
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account } from '../types';
import { getStoredAccounts } from '../utils/storage';
import { useTransactions } from '../contexts/TransactionsContext';
import type { MainStackParamList } from '../navigation/MainStack';
import Ionicons from '@expo/vector-icons/Ionicons';

const TITLE = '帳本餘額';
const BACK_ICON_SIZE = 28;
const SUBTITLE = '各帳戶目前餘額（含初始金額與收支）';
const LABEL_EDIT = '編輯';
const EMPTY_HINT = '尚無帳戶，請至設定或導覽完成帳戶設定';

function computeBalance(accountId: string, initialBalance: number, transactions: { type: string; amount: number; accountId?: string }[]): number {
  let balance = initialBalance;
  for (const t of transactions) {
    if (t.accountId !== accountId) continue;
    if (t.type === 'income') balance += t.amount;
    else balance -= t.amount;
  }
  return balance;
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

type NavProp = NativeStackNavigationProp<MainStackParamList, 'LedgerBalance'>;

export default function LedgerBalanceScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { transactions } = useTransactions();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAccounts = useCallback(() => {
    getStoredAccounts().then(setAccounts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAccounts();
    }, [loadAccounts])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAccounts();
    setRefreshing(false);
  }, [loadAccounts]);

  const balances = accounts.map((acc) => ({
    account: acc,
    balance: computeBalance(acc.id, acc.initialBalance, transactions),
  }));

  const totalBalance = balances.reduce((sum, { balance }) => sum + balance, 0);

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
        <Text style={styles.subtitle}>{SUBTITLE}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>{EMPTY_HINT}</Text>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>總餘額</Text>
              <Text
                style={[
                  styles.totalAmount,
                  totalBalance >= 0 ? styles.totalPositive : styles.totalNegative,
                ]}
              >
                {formatAmount(totalBalance)}
              </Text>
            </View>

            {balances.map(({ account, balance }) => (
              <View key={account.id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {account.name.trim() || '未命名帳戶'}
                  </Text>
                  <Text
                    style={[
                      styles.balanceAmount,
                      balance >= 0 ? styles.balancePositive : styles.balanceNegative,
                    ]}
                  >
                    {formatAmount(balance)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() =>
                    navigation.navigate('EditAccount', { accountId: account.id })
                  }
                  hitSlop={8}
                >
                  <Text style={styles.editBtnText}>{LABEL_EDIT}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 40,
  },
  totalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  totalPositive: {
    color: '#059669',
  },
  totalNegative: {
    color: '#dc2626',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardMain: {
    flex: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
  },
  balanceAmount: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
  },
  balancePositive: {
    color: '#059669',
  },
  balanceNegative: {
    color: '#dc2626',
  },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  editBtnText: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '500',
  },
});
