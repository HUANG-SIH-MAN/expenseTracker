/**
 * 主要貨幣設定頁：選擇記帳與餘額顯示使用的貨幣
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { CurrencyCode } from '../types';
import { getStoredPrimaryCurrency, updateStoredPrimaryCurrency } from '../utils/storage';
import { CURRENCY_LABELS } from '../constants';

const TITLE = '主要貨幣';
const BTN_SAVE = '儲存';
const BACK_ICON_SIZE = 28;
const SECTION_DESC = '記帳與餘額顯示使用的貨幣';

const SUPPORTED_CURRENCY_CODES: CurrencyCode[] = [
  'TWD',
  'USD',
  'JPY',
  'EUR',
  'CNY',
  'KRW',
  'GBP',
];

type NavProp = NativeStackNavigationProp<MainStackParamList, 'PrimaryCurrency'>;

export default function PrimaryCurrencyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [primaryCurrency, setPrimaryCurrency] = useState<CurrencyCode>('TWD');

  useFocusEffect(
    useCallback(() => {
      getStoredPrimaryCurrency().then(setPrimaryCurrency);
    }, [])
  );

  const handleSelectCurrency = useCallback(async (code: CurrencyCode) => {
    await updateStoredPrimaryCurrency(code);
    setPrimaryCurrency(code);
  }, []);

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
      >
        <Text style={styles.sectionDesc}>{SECTION_DESC}</Text>
        <View style={styles.currencyList}>
          {SUPPORTED_CURRENCY_CODES.map((code) => {
            const isSelected = primaryCurrency === code;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.currencyRow, isSelected && styles.currencyRowSelected]}
                onPress={() => handleSelectCurrency(code)}
                activeOpacity={0.7}
              >
                <Text style={[styles.currencyLabel, isSelected && styles.currencyLabelSelected]}>
                  {CURRENCY_LABELS[code] ?? code}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{BTN_SAVE}</Text>
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
    paddingTop: 20,
    paddingBottom: 32,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  currencyList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  currencyRowSelected: {
    backgroundColor: '#eff6ff',
  },
  currencyLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  currencyLabelSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
