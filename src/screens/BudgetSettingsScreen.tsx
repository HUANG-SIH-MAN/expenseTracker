/**
 * 預算規劃：Tab 切換「月預算」與「年預算」；月預算 = 每月固定/預估支出 + 預算設定；年預算 = 某月某項目金額規劃與計劃 vs 實際。
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { MonthlyFixedItem } from '../types';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';
import { MonthlyBudgetTab } from '../components/MonthlyBudgetTab';
import { AnnualBudgetTab } from '../components/AnnualBudgetTab';

const TITLE = '預算規劃';
const TAB_MONTHLY = '月預算';
const TAB_ANNUAL = '年預算';
const BACK_ICON_SIZE = 28;

type NavProp = NativeStackNavigationProp<
  MainStackParamList,
  'BudgetSettings'
>;

type BudgetTab = 'monthly' | 'annual';

export default function BudgetSettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { refreshBudget } = useBudget();
  const [tab, setTab] = useState<BudgetTab>('monthly');

  useFocusEffect(
    useCallback(() => {
      refreshBudget();
    }, [refreshBudget])
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
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

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'monthly' && styles.tabBtnActive]}
          onPress={() => setTab('monthly')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'monthly' && styles.tabBtnTextActive]}>
            {TAB_MONTHLY}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'annual' && styles.tabBtnActive]}
          onPress={() => setTab('annual')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'annual' && styles.tabBtnTextActive]}>
            {TAB_ANNUAL}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'monthly' ? (
        <MonthlyBudgetTab navigation={navigation} insets={insets} />
      ) : (
        <AnnualBudgetTab insets={insets} />
      )}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 8,
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  tabBtnActive: {
    backgroundColor: '#2563eb',
  },
  tabBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabBtnTextActive: {
    color: '#fff',
  },
});
