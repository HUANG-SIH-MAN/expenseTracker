/**
 * 記帳表單用：選擇要連結的預算項目（每月固定 或 年度預算）
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/MainStack';
import { useBudget } from '../contexts/BudgetContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getAnnualBudgetEntries } from '../utils/storage';
import type { AnnualBudgetEntry, TransactionType } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SelectBudgetLink'>;

const BACK_ICON_SIZE = 28;
const CHECK_SIZE = 22;

export default function SelectBudgetLinkScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<Props['route']>();
  const {
    transactionType,
    dateKey,
    currentMonthlyFixedItemId,
    currentAnnualBudgetEntryId,
    returnDate,
    returnTransactionId,
  } = route.params;

  const { monthlyFixedItems } = useBudget();
  const { getCategoryLabel } = useCategories();

  const [annualEntries, setAnnualEntries] = useState<
    Pick<AnnualBudgetEntry, 'id' | 'month' | 'categoryKey' | 'label' | 'estimatedAmount'>[]
  >([]);

  const [year, month] = dateKey.split('-').map(Number);

  useEffect(() => {
    getAnnualBudgetEntries(year).then((list) => {
      setAnnualEntries(
        list
          .filter((e) => e.month === month && e.type === (transactionType as TransactionType))
          .map((e) => ({
            id: e.id,
            month: e.month,
            categoryKey: e.categoryKey,
            label: e.label,
            estimatedAmount: e.estimatedAmount,
          }))
      );
    });
  }, [year, month, transactionType]);

  const pick = (monthlyId: string | undefined, annualId: string | undefined) => {
    navigation.navigate({
      name: 'AddTransaction',
      pop: true,
      merge: true,
      params: {
        selectedDate: returnDate,
        transactionId: returnTransactionId,
        pickedMonthlyFixedItemId: monthlyId ?? null,
        pickedAnnualBudgetEntryId: annualId ?? null,
      },
    });
  };

  const hasMonthly = transactionType === 'expense' && monthlyFixedItems.length > 0;
  const hasAnnual = annualEntries.length > 0;
  const noneSelected = currentMonthlyFixedItemId == null && currentAnnualBudgetEntryId == null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>連接預算項目</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={[styles.row, noneSelected && styles.rowSelected]}
          onPress={() => pick(undefined, undefined)}
          activeOpacity={0.7}
        >
          <Text style={[styles.rowLabel, noneSelected && styles.rowLabelSelected]}>不連結</Text>
          {noneSelected ? (
            <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
          ) : (
            <View style={styles.checkPlaceholder} />
          )}
        </TouchableOpacity>

        {hasMonthly ? (
          <>
            <Text style={styles.sectionHeader}>每月固定收支</Text>
            {monthlyFixedItems.map((item) => {
              const isSelected = currentMonthlyFixedItemId === item.id;
              const amountLabel =
                item.currency && item.currency !== 'TWD' && item.originalAmount != null
                  ? `${item.originalAmount} ${item.currency} ≈ NT$${Math.round(item.estimatedAmount).toLocaleString()}`
                  : `NT$${item.estimatedAmount.toLocaleString()}`;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => pick(item.id, undefined)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowContent}>
                    <Text
                      style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    <Text style={styles.rowSub}>預估 {amountLabel}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
                  ) : (
                    <View style={styles.checkPlaceholder} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}

        {hasAnnual ? (
          <>
            <Text style={styles.sectionHeader}>年度固定收支</Text>
            {annualEntries.map((e) => {
              const isSelected = currentAnnualBudgetEntryId === e.id;
              const displayName = e.label
                ? `${e.month}月 ${e.label}（${getCategoryLabel(transactionType as TransactionType, e.categoryKey)}）`
                : `${e.month}月 ${getCategoryLabel(transactionType as TransactionType, e.categoryKey)}`;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => pick(undefined, e.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowContent}>
                    <Text
                      style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                    <Text style={styles.rowSub}>計劃 NT${e.estimatedAmount.toLocaleString()}</Text>
                  </View>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
                  ) : (
                    <View style={styles.checkPlaceholder} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}

        {!hasMonthly && !hasAnnual ? (
          <Text style={styles.empty}>目前沒有可連結的固定收支項目</Text>
        ) : null}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerRightSpacer: {
    width: BACK_ICON_SIZE + 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowSelected: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowLabel: {
    fontSize: 16,
    color: '#374151',
  },
  rowLabelSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  checkPlaceholder: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
  },
  empty: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 40,
  },
});
