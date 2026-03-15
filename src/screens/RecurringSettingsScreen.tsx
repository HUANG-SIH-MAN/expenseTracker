/**
 * 固定收支設定頁：列表、新增（跳編輯頁）、編輯（跳編輯頁）、刪除
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
import type { RecurringItem } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { getStoredRecurring, saveRecurring } from '../utils/storage';

const TITLE = '固定收支';
const BACK_ICON_SIZE = 28;
const BTN_ADD = '新增固定收支';
const REPEAT_MONTHLY = '每月';
const REPEAT_WEEKLY = '每週';
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

type NavProp = NativeStackNavigationProp<MainStackParamList, 'RecurringSettings'>;

function formatRecurringRepeat(item: RecurringItem): string {
  if (item.repeat === 'monthly') {
    return `${REPEAT_MONTHLY} ${item.day} 日`;
  }
  return `${REPEAT_WEEKLY} ${WEEKDAY_LABELS[item.day] ?? ''}`;
}

export default function RecurringSettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { getCategoryLabel } = useCategories();
  const [list, setList] = useState<RecurringItem[]>([]);
  /** 待確認刪除的項目，有值時顯示畫面內確認列 */
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<RecurringItem | null>(null);

  const loadData = useCallback(async () => {
    const recurring = await getStoredRecurring();
    setList(recurring);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const openAdd = () => {
    navigation.navigate('RecurringEdit', {});
  };

  const openEdit = (item: RecurringItem) => {
    navigation.navigate('RecurringEdit', { recurringId: item.id });
  };

  const askDelete = (item: RecurringItem) => {
    setConfirmDeleteItem(item);
  };

  const cancelDelete = () => {
    setConfirmDeleteItem(null);
  };

  const confirmDelete = useCallback(async () => {
    const item = confirmDeleteItem;
    if (!item) return;
    const next = list.filter((r) => r.id !== item.id);
    try {
      await saveRecurring(next);
      setList(next);
      setConfirmDeleteItem(null);
    } catch {
      loadData();
      setConfirmDeleteItem(null);
    }
  }, [confirmDeleteItem, list, loadData]);

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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator
      >
        {list.length === 0 ? (
          <Text style={styles.emptyHint}>尚無固定收支，可點下方按鈕新增</Text>
        ) : (
          <View style={styles.listBlock}>
            {list.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.row,
                  index === list.length - 1 && styles.rowLast,
                ]}
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[
                      styles.typeBadge,
                      item.type === 'income' ? styles.typeBadgeIncome : styles.typeBadgeExpense,
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {item.type === 'income' ? '收入' : '支出'}
                    </Text>
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowAmount}>
                      {item.type === 'income' ? '+' : '-'}{item.amount}
                    </Text>
                    <Text style={styles.rowCategory} numberOfLines={1}>
                      {getCategoryLabel(item.type, item.category)}
                    </Text>
                    <Text style={styles.rowRepeat}>{formatRecurringRepeat(item)}</Text>
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => openEdit(item)}
                    hitSlop={12}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil" size={20} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => askDelete(item)}
                    hitSlop={12}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
          <Text style={styles.addBtnText}>{BTN_ADD}</Text>
        </TouchableOpacity>
      </ScrollView>

      {confirmDeleteItem != null ? (
        <View style={[styles.confirmBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.confirmText} numberOfLines={1}>
            確定要刪除「{confirmDeleteItem.type === 'expense' ? '支出' : '收入'} {confirmDeleteItem.amount}」？
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={cancelDelete} activeOpacity={0.7}>
              <Text style={styles.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmDeleteBtn} onPress={confirmDelete} activeOpacity={0.7}>
              <Text style={styles.confirmDeleteText}>刪除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
    flexGrow: 1,
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
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  typeBadgeExpense: {
    backgroundColor: '#fef2f2',
  },
  typeBadgeIncome: {
    backgroundColor: '#f0fdf4',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  rowMain: {
    flex: 1,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  rowCategory: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  rowRepeat: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    padding: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
  confirmBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  confirmText: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 12,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  confirmCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  confirmDeleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
