/**
 * 帳本餘額頁：顯示每個帳本的目前餘額與總資產（主幣別）
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Account } from '../types';
import {
  getStoredAccounts,
  getStoredPrimaryCurrency,
  getExchangeRates,
  saveExchangeRates,
  getCurrencyOptions,
} from '../utils/storage';
import { useTransactions } from '../contexts/TransactionsContext';
import { getAccountBalancesWithPrimary, getTotalAssetsInPrimary, buildForeignCostBasisMap } from '../utils/balance';
import type { ForeignAccountCostBasis } from '../utils/balance';
import { fetchRatesToPrimary } from '../utils/exchangeRate';
import type { CurrencyOption } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomBar } from '../components';

const TITLE = '帳本餘額';
const BACK_ICON_SIZE = 28;
const SUBTITLE = '各帳戶目前餘額（含初始金額與收支）';
const LABEL_EDIT = '編輯';
const EMPTY_HINT = '尚無帳戶，請至設定或導覽完成帳戶設定';
const LABEL_TOTAL_ASSETS = '總資產';
const LABEL_ABOUT = '約';
const BTN_UPDATE_RATES = '更新匯率';
const BTN_ADD_ACCOUNT = '新增帳本';
const HINT_UPDATE_RATES_FIRST = '請先更新匯率以換算總資產';

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function getCurrencyLabel(code: string, options: CurrencyOption[]): string {
  const o = options.find((x) => x.code === code);
  return o?.label ?? code;
}

type NavProp = NativeStackNavigationProp<MainStackParamList, 'LedgerBalance'>;

export default function LedgerBalanceScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { transactions } = useTransactions();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('TWD');
  const [ratesToPrimary, setRatesToPrimary] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [updatingRates, setUpdatingRates] = useState(false);

  const loadData = useCallback(() => {
    Promise.all([
      getStoredAccounts(),
      getCurrencyOptions(),
      getStoredPrimaryCurrency(),
      getExchangeRates(),
    ]).then(([accts, options, primary, ratesData]) => {
      setAccounts(accts.filter((a) => !a.isDeleted));
      setCurrencyOptions(options);
      setPrimaryCurrency(primary);
      setRatesToPrimary(ratesData.rates ?? {});
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  const onUpdateRates = useCallback(async () => {
    setUpdatingRates(true);
    const codes = currencyOptions.map((o) => o.code);
    const rates = await fetchRatesToPrimary(primaryCurrency, codes);
    if (rates != null) {
      await saveExchangeRates(rates);
      setRatesToPrimary(rates);
    }
    setUpdatingRates(false);
  }, [primaryCurrency, currencyOptions]);

  const costBasisItems = useMemo(
    () => buildForeignCostBasisMap(accounts, transactions, primaryCurrency as import('../types').CurrencyCode),
    [accounts, transactions, primaryCurrency],
  );

  const balanceItems = getAccountBalancesWithPrimary(
    accounts,
    transactions,
    ratesToPrimary,
    primaryCurrency as import('../types').CurrencyCode,
  );
  const totalInPrimary = getTotalAssetsInPrimary(
    accounts,
    transactions,
    ratesToPrimary,
    primaryCurrency as import('../types').CurrencyCode,
  );
  const primaryLabel = getCurrencyLabel(primaryCurrency, currencyOptions);
  const hasRates = Object.keys(ratesToPrimary).length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{TITLE}</Text>
        <Text style={styles.subtitle}>{SUBTITLE}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {accounts.length === 0 ? (
          <>
            <Text style={styles.emptyText}>{EMPTY_HINT}</Text>
            <TouchableOpacity
              style={styles.addAccountPrimaryBtn}
              onPress={() => navigation.navigate('AddAccount')}
            >
              <Text style={styles.addAccountPrimaryBtnText}>{BTN_ADD_ACCOUNT}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>
                {LABEL_TOTAL_ASSETS} {hasRates ? `${LABEL_ABOUT} ${primaryLabel}` : ''}
              </Text>
              {hasRates ? (
                <Text
                  style={[
                    styles.totalAmount,
                    totalInPrimary >= 0 ? styles.totalPositive : styles.totalNegative,
                  ]}
                >
                  {formatAmount(totalInPrimary)}
                </Text>
              ) : (
                <Text style={styles.ratesHint}>{HINT_UPDATE_RATES_FIRST}</Text>
              )}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.updateRatesBtn}
                onPress={onUpdateRates}
                disabled={updatingRates}
              >
                {updatingRates ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Text style={styles.updateRatesBtnText}>{BTN_UPDATE_RATES}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.updateRatesBtn, styles.addAccountBtn]}
                onPress={() => navigation.navigate('AddAccount')}
              >
                <Text style={styles.updateRatesBtnText}>{BTN_ADD_ACCOUNT}</Text>
              </TouchableOpacity>
            </View>

            {balanceItems.map(({ account, balance, balanceInPrimary }) => {
              const costBasis = costBasisItems.get(account.id);
              return (
              <View key={account.id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {account.name.trim() || '未命名帳戶'}
                  </Text>
                  <Text style={styles.currencyCode}>
                    {getCurrencyLabel(account.currency ?? 'TWD', currencyOptions)}
                  </Text>
                  <Text
                    style={[
                      styles.balanceAmount,
                      balance >= 0 ? styles.balancePositive : styles.balanceNegative,
                    ]}
                  >
                    {formatAmount(balance)}
                  </Text>
                  {account.currency !== primaryCurrency && hasRates && (
                    <Text style={styles.balanceInPrimary}>
                      {LABEL_ABOUT} {formatAmount(balanceInPrimary)} {primaryCurrency}
                    </Text>
                  )}
                  {costBasis != null && (
                    <>
                      <Text style={styles.costBasisRate}>
                        換匯均價：{costBasis.avgRateToPrimary.toFixed(4)} {primaryCurrency}/{account.currency}
                      </Text>
                      <Text style={styles.costBasisTotal}>
                        持有成本：≈ {primaryCurrency} {Math.round(costBasis.currentPrimaryCost).toLocaleString()}
                      </Text>
                    </>
                  )}
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
              );
            })}
          </>
        )}
      </ScrollView>
      <BottomBar />
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
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
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
  addAccountPrimaryBtn: {
    alignSelf: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  addAccountPrimaryBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
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
  ratesHint: {
    fontSize: 14,
    color: '#6b7280',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  updateRatesBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  addAccountBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  updateRatesBtnText: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '500',
  },
  currencyCode: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  balanceInPrimary: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
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
  costBasisRate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  costBasisTotal: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
