/**
 * 記帳表單用：選擇帳戶（由 AddTransaction 推入）
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account } from '../types';
import type { MainStackParamList } from '../navigation/MainStack';
import { getStoredAccounts } from '../utils/storage';

const TITLE = '選擇帳戶';
const BACK_ICON_SIZE = 28;
const CHECK_SIZE = 22;
const EMPTY_HINT = '尚無帳戶，請至帳本新增';

type Props = NativeStackScreenProps<MainStackParamList, 'SelectTransactionAccount'>;

export default function SelectTransactionAccountScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<Props['route']>();
  const { selectedAccountId, returnDate, returnTransactionId } = route.params;
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    getStoredAccounts().then((list) => {
      setAccounts(list.filter((a) => a.name.trim() !== ''));
    });
  }, []);

  const pick = (id: string) => {
    navigation.navigate({
      name: 'AddTransaction',
      merge: true,
      params: {
        selectedDate: returnDate,
        transactionId: returnTransactionId,
        pickedAccountId: id,
      },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{TITLE}</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {accounts.length === 0 ? (
          <Text style={styles.empty}>{EMPTY_HINT}</Text>
        ) : (
          accounts.map((acc, index) => {
            const selected = acc.id === selectedAccountId;
            const isLast = index === accounts.length - 1;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[styles.row, isLast && styles.rowLast]}
                onPress={() => pick(acc.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
                  {acc.name}
                </Text>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
                ) : (
                  <View style={styles.checkPlaceholder} />
                )}
              </TouchableOpacity>
            );
          })
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
  empty: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 32,
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
  rowLast: {
    marginBottom: 0,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  rowLabelSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  checkPlaceholder: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
  },
});
