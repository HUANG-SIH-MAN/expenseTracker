/**
 * 設定頁：設定項目列表，點選進入個別設定頁
 */
import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import { useTransactions } from '../contexts/TransactionsContext';
import { useBudget } from '../contexts/BudgetContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import { clearAllData } from '../utils/storage';
import { BottomBar } from '../components';

const TITLE = '設定';
const BACK_ICON_SIZE = 28;
const CLEAR_DATA_TITLE = '清除所有資料';
const CLEAR_DATA_SUBTITLE = '含所有用戶設定與資料，將回到一開始的導覽畫面，無法復原';
const CONFIRM_FIRST_TITLE = '確定要清除所有資料嗎？';
const CONFIRM_FIRST_MSG = '此操作無法復原。';
const CONFIRM_SECOND_TITLE = '再次確認';
const CONFIRM_SECOND_MSG =
  '將刪除所有記帳、類別、固定收支、預算與帳本等用戶設定，並回到一開始的導覽畫面。確定要執行？';
const BTN_CANCEL = '取消';
const BTN_CONTINUE = '繼續';
const BTN_CONFIRM_CLEAR = '確定清除';

/** 設定子頁的畫面名稱（僅列出無參數的設定頁） */
type SettingScreenName =
  | 'LedgerBalance'
  | 'BudgetSettings'
  | 'PrimaryCurrency'
  | 'ExchangeRates'
  | 'CurrencySettings'
  | 'CategorySettings'
  | 'RecurringSettings'
  | 'CreditCardAutoPaySettings'
  | 'CashTopUpSettings'
  | 'TransferTemplateSettings'
  | 'InvestmentSettings';

const SETTING_ITEMS: { screen: SettingScreenName; title: string; subtitle?: string }[] = [
  { screen: 'LedgerBalance', title: '帳本餘額', subtitle: '各帳戶目前餘額（含初始金額與收支）' },
  { screen: 'BudgetSettings', title: '預算設定', subtitle: '每月固定預算與年度預算規劃' },
  { screen: 'PrimaryCurrency', title: '主要貨幣', subtitle: '記帳與餘額顯示使用的貨幣' },
  { screen: 'ExchangeRates', title: '匯率', subtitle: '各幣別對主幣別匯率、立即更新' },
  { screen: 'CurrencySettings', title: '幣別管理', subtitle: '新增或刪除自訂幣別' },
  { screen: 'CategorySettings', title: '類別管理', subtitle: '自訂支出與收入類別、圖示' },
  { screen: 'RecurringSettings', title: '固定收支', subtitle: '週期性固定項目（如月租、薪水）' },
  { screen: 'CreditCardAutoPaySettings', title: '信用卡自動扣款', subtitle: '設定結帳日與扣款日，自動建立轉帳' },
  { screen: 'CashTopUpSettings', title: '現金自動補充', subtitle: '餘額低於門檻時自動記錄補充轉帳' },
  { screen: 'TransferTemplateSettings', title: '轉帳模板', subtitle: '儲值時自動帶入帳戶與附加收支' },
  { screen: 'InvestmentSettings', title: '投資設定', subtitle: 'ETF 持股資料 API Key 管理' },
];

type NavProp = NativeStackNavigationProp<MainStackParamList, 'Settings'>;

export default function SettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { refreshTransactions } = useTransactions();
  const { refreshBudget } = useBudget();
  const { refreshOnboardingState } = useOnboarding();

  const performClear = useCallback(async () => {
    try {
      await clearAllData();
    } catch (e) {
      Alert.alert('清除失敗', `clearAllData 錯誤：\n${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    try {
      await refreshTransactions();
      await refreshBudget();
      await refreshOnboardingState();
    } catch (e) {
      Alert.alert('清除失敗', `refresh 錯誤：\n${e instanceof Error ? e.message : String(e)}`);
    }
  }, [refreshTransactions, refreshBudget, refreshOnboardingState]);

  const handleClearDataPress = useCallback(() => {
    if (Platform.OS === 'web') {
      const first = window.confirm(
        `${CONFIRM_FIRST_TITLE}\n\n${CONFIRM_FIRST_MSG}`
      );
      if (!first) return;
      const second = window.confirm(
        `${CONFIRM_SECOND_TITLE}\n\n${CONFIRM_SECOND_MSG}`
      );
      if (second) performClear();
      return;
    }
    Alert.alert(
      CONFIRM_FIRST_TITLE,
      CONFIRM_FIRST_MSG,
      [
        { text: BTN_CANCEL, style: 'cancel' },
        {
          text: BTN_CONTINUE,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              CONFIRM_SECOND_TITLE,
              CONFIRM_SECOND_MSG,
              [
                { text: BTN_CANCEL, style: 'cancel' },
                {
                  text: BTN_CONFIRM_CLEAR,
                  style: 'destructive',
                  onPress: performClear,
                },
              ]
            );
          },
        },
      ]
    );
  }, [performClear]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{TITLE}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      >
        <View style={styles.list}>
          {SETTING_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.screen}
              style={styles.row}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {item.subtitle != null && (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('ImportExport')}
            activeOpacity={0.7}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>資料匯入與匯出</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                匯出記帳 CSV、匯入其他 APP 的 CSV
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.clearDataRow}
          onPress={handleClearDataPress}
          activeOpacity={0.7}
        >
          <View style={styles.clearDataContent}>
            <Text style={styles.clearDataTitle}>{CLEAR_DATA_TITLE}</Text>
            <Text style={styles.clearDataSubtitle} numberOfLines={1}>
              {CLEAR_DATA_SUBTITLE}
            </Text>
          </View>
          <Ionicons name="trash-outline" size={20} color="#dc2626" />
        </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
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
    paddingTop: 20,
  },
  clearDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearDataContent: {
    flex: 1,
    marginRight: 8,
  },
  clearDataTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
  clearDataSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
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
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
});
