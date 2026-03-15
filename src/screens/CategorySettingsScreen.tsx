/**
 * 類別設定頁：編輯支出/收入類別與圖示
 * 拖曳排序參考 PanResponder + Animated 做法（與 FoodTagEditorModal 相同）
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { CategoryItem, StoredCategories, TransactionType } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { CATEGORY_ICON_OPTIONS } from '../constants';

const TITLE = '類別管理';
const BACK_ICON_SIZE = 28;
const TAB_EXPENSE = '支出類別';
const TAB_INCOME = '收入類別';
const BTN_ADD = '新增類別';
const MODAL_TITLE_ADD = '新增類別';
const MODAL_TITLE_EDIT = '編輯類別';
const PLACEHOLDER_LABEL = '類別名稱';
const BTN_SAVE = '儲存';
const BTN_CANCEL = '取消';
const MIN_CATEGORIES_COUNT = 1;
const ROW_HEIGHT = 56;
const SWAP_THRESHOLD_RATIO = 0.8;

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CategorySettings'>;

interface DraggableCategoryRowProps {
  item: CategoryItem;
  index: number;
  totalItems: number;
  isLast: boolean;
  canDelete: boolean;
  onSwap: (index1: number, index2: number) => void;
  onEdit: (item: CategoryItem) => void;
  onDelete: (item: CategoryItem) => void;
}

function DraggableCategoryRow({
  item,
  index,
  totalItems,
  isLast,
  canDelete,
  onSwap,
  onEdit,
  onDelete,
}: DraggableCategoryRowProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const rowTranslateY = useRef(new Animated.Value(0)).current;
  const lastSwappedTargetRef = useRef<number | null>(null);
  const indexRef = useRef(index);
  const totalItemsRef = useRef(totalItems);
  const onSwapRef = useRef(onSwap);
  indexRef.current = index;
  totalItemsRef.current = totalItems;
  onSwapRef.current = onSwap;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDragging(true);
        lastSwappedTargetRef.current = null;
      },
      onPanResponderMove: (_, gestureState) => {
        rowTranslateY.setValue(gestureState.dy);
        const moveDist = gestureState.dy;
        const threshold = ROW_HEIGHT * SWAP_THRESHOLD_RATIO;
        if (Math.abs(moveDist) > threshold) {
          const swapDir = moveDist > 0 ? 1 : -1;
          const currentIndex = indexRef.current;
          const currentTotal = totalItemsRef.current;
          const targetIndex = currentIndex + swapDir;
          if (
            targetIndex >= 0 &&
            targetIndex < currentTotal &&
            targetIndex !== lastSwappedTargetRef.current
          ) {
            lastSwappedTargetRef.current = targetIndex;
            onSwapRef.current(currentIndex, targetIndex);
          }
        }
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
        lastSwappedTargetRef.current = null;
        Animated.spring(rowTranslateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        lastSwappedTargetRef.current = null;
        rowTranslateY.setValue(0);
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.row,
        isLast && styles.rowLast,
        isDragging && styles.draggingRow,
        { transform: [{ translateY: rowTranslateY }] },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.dragHandle}>
        <Ionicons
          name="reorder-three"
          size={22}
          color={isDragging ? '#2563eb' : '#9ca3af'}
        />
      </View>
      <Text style={styles.rowIcon}>{item.icon}</Text>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {item.label}
      </Text>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(item)} hitSlop={8}>
          <Ionicons name="pencil" size={20} color="#2563eb" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => onDelete(item)}
          hitSlop={8}
          disabled={!canDelete}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={canDelete ? '#dc2626' : '#9ca3af'}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export default function CategorySettingsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { expenseCategories, incomeCategories, updateCategories } = useCategories();
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('📌');

  const list = activeTab === 'expense' ? expenseCategories : incomeCategories;
  const listRef = useRef(list);
  const expenseRef = useRef(expenseCategories);
  const incomeRef = useRef(incomeCategories);
  const activeTabRef = useRef(activeTab);
  listRef.current = list;
  expenseRef.current = expenseCategories;
  incomeRef.current = incomeCategories;
  activeTabRef.current = activeTab;

  useFocusEffect(
    useCallback(() => {
      setModalVisible(false);
      setEditingItem(null);
    }, [])
  );

  const openAdd = () => {
    setEditingItem(null);
    setEditLabel('');
    setEditIcon(CATEGORY_ICON_OPTIONS[0] ?? '📌');
    setModalVisible(true);
  };

  const openEdit = (item: CategoryItem) => {
    setEditingItem(item);
    setEditLabel(item.label);
    setEditIcon(item.icon);
    setModalVisible(true);
  };

  const handleDelete = (item: CategoryItem) => {
    if (list.length <= MIN_CATEGORIES_COUNT) {
      Alert.alert('無法刪除', '至少需保留一個類別。');
      return;
    }
    Alert.alert(
      '刪除類別',
      `確定要刪除「${item.label}」嗎？已使用此類別的紀錄仍會保留，但會以類別代碼顯示。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => {
            const nextList = list.filter((c) => c.key !== item.key);
            const next: StoredCategories = {
              expense: activeTab === 'expense' ? nextList : expenseCategories,
              income: activeTab === 'income' ? nextList : incomeCategories,
            };
            updateCategories(next);
          },
        },
      ]
    );
  };

  const handleSaveCategory = () => {
    const label = editLabel.trim();
    if (!label) return;
    if (editingItem) {
      const nextList = list.map((c) =>
        c.key === editingItem.key ? { ...c, label, icon: editIcon } : c
      );
      const next: StoredCategories = {
        expense: activeTab === 'expense' ? nextList : expenseCategories,
        income: activeTab === 'income' ? nextList : incomeCategories,
      };
      updateCategories(next);
    } else {
      const key = `custom_${Date.now()}`;
      const newItem: CategoryItem = { key, label, icon: editIcon };
      const nextList = [...list, newItem];
      const next: StoredCategories = {
        expense: activeTab === 'expense' ? nextList : expenseCategories,
        income: activeTab === 'income' ? nextList : incomeCategories,
      };
      updateCategories(next);
    }
    setModalVisible(false);
    setEditingItem(null);
  };

  const swapCategories = useCallback((index1: number, index2: number) => {
    const currentList = listRef.current;
    if (index2 < 0 || index2 >= currentList.length) return;
    const nextList = [...currentList];
    [nextList[index1], nextList[index2]] = [nextList[index2], nextList[index1]];
    const tab = activeTabRef.current;
    const next: StoredCategories = {
      expense: tab === 'expense' ? nextList : expenseRef.current,
      income: tab === 'income' ? nextList : incomeRef.current,
    };
    updateCategories(next);
  }, [updateCategories]);

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

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'expense' && styles.tabActive]}
          onPress={() => setActiveTab('expense')}
        >
          <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>
            {TAB_EXPENSE}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'income' && styles.tabActive]}
          onPress={() => setActiveTab('income')}
        >
          <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>
            {TAB_INCOME}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.dragHint}>按住左側圖示並上下拖曳來調整順序</Text>
        <View style={styles.listBlock}>
          {list.map((item, index) => (
            <DraggableCategoryRow
              key={item.key}
              item={item}
              index={index}
              totalItems={list.length}
              isLast={index === list.length - 1}
              canDelete={list.length > MIN_CATEGORIES_COUNT}
              onSwap={swapCategories}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </View>
        <View style={styles.listFooter}>
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
            <Text style={styles.addBtnText}>{BTN_ADD}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>
              {editingItem ? MODAL_TITLE_EDIT : MODAL_TITLE_ADD}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={PLACEHOLDER_LABEL}
              placeholderTextColor="#9ca3af"
              value={editLabel}
              onChangeText={setEditLabel}
              autoCapitalize="none"
            />
            <Text style={styles.iconPickerLabel}>圖示</Text>
            <ScrollView
              style={styles.iconPickerScroll}
              contentContainerStyle={styles.iconPickerGrid}
              keyboardShouldPersistTaps="handled"
            >
              {CATEGORY_ICON_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.iconOption, editIcon === emoji && styles.iconOptionSelected]}
                  onPress={() => setEditIcon(emoji)}
                >
                  <Text style={styles.iconOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnSecondaryText}>{BTN_CANCEL}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, !editLabel.trim() && styles.modalBtnDisabled]}
                onPress={handleSaveCategory}
                disabled={!editLabel.trim()}
              >
                <Text style={styles.modalBtnPrimaryText}>{BTN_SAVE}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#fff',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexGrow: 1,
  },
  dragHint: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 10,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    height: ROW_HEIGHT,
    backgroundColor: '#fff',
    zIndex: 1,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  draggingRow: {
    backgroundColor: '#eff6ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
    zIndex: 10,
    borderRadius: 10,
    borderBottomWidth: 0,
  },
  dragHandle: {
    padding: 12,
    marginLeft: -12,
    marginRight: 4,
  },
  rowIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 4,
  },
  listFooter: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  iconPickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  iconPickerScroll: {
    maxHeight: 160,
    marginBottom: 20,
  },
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: {
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  iconOptionText: {
    fontSize: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  modalBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2563eb',
  },
  modalBtnDisabled: {
    opacity: 0.5,
  },
  modalBtnPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
