/**
 * 記帳表單用：選擇收入/支出類別（由 AddTransaction 推入）
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories } from '../contexts/CategoriesContext';
import type { MainStackParamList } from '../navigation/MainStack';

const TITLE = '選擇類別';
const BACK_ICON_SIZE = 28;
const ROW_ICON_FONT = 20;
const ROW_ICON_WIDTH = 36;
const CHECK_SIZE = 22;

type Props = NativeStackScreenProps<MainStackParamList, 'SelectTransactionCategory'>;

export default function SelectTransactionCategoryScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<Props['route']>();
  const { transactionType, selectedKey, returnDate, returnTransactionId } = route.params;
  const { expenseCategories, incomeCategories } = useCategories();
  const list = transactionType === 'expense' ? expenseCategories : incomeCategories;

  const pick = (key: string) => {
    navigation.navigate({
      name: 'AddTransaction',
      merge: true,
      params: {
        selectedDate: returnDate,
        transactionId: returnTransactionId,
        pickedCategoryKey: key,
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
        {list.map((item, index) => {
          const selected = item.key === selectedKey;
          const isLast = index === list.length - 1;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, isLast && styles.rowLast]}
              onPress={() => pick(item.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.rowIcon}>{item.icon}</Text>
              <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
                {item.label}
              </Text>
              {selected ? (
                <Ionicons name="checkmark-circle" size={CHECK_SIZE} color="#2563eb" />
              ) : (
                <View style={styles.checkPlaceholder} />
              )}
            </TouchableOpacity>
          );
        })}
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
  rowIcon: {
    width: ROW_ICON_WIDTH,
    fontSize: ROW_ICON_FONT,
    textAlign: 'center',
    marginRight: 12,
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
