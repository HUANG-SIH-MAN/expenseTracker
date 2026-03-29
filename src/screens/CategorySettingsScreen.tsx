/**
 * 類別設定頁：編輯支出/收入類別與圖示
 * 排序：PanResponder（與手動新增類別相同）；列表捲動使用 RNGH ScrollView 以降低與拖曳衝突
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
  Platform,
} from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParamList } from '../navigation/MainStack';
import type { Account, CategoryItem, TransactionType } from '../types';
import { useCategories } from '../contexts/CategoriesContext';
import { CATEGORY_ICON_OPTIONS } from '../constants';
import { getStoredAccounts } from '../utils/storage';
import { resolveEffectiveDefaultAccountId } from '../utils/categoryDefaultAccount';
import { newCustomCategoryKey } from '../utils/categoryKey';

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
const LABEL_DEFAULT_ACCOUNT = '預設帳戶（選填）';
const DEFAULT_ACCOUNT_NONE = '不指定';
const DEFAULT_ACCOUNT_INVALID = '（預設帳戶已失效，請重選）';
const MIN_CATEGORIES_COUNT = 1;
/** 列內距（與分隔線之間的留白） */
const ROW_VERTICAL_PADDING = 12;
/** 列表 emoji 字級：勿與列高綁成同一比例，否則縮字級時列高跟著縮，視覺上永遠「撐滿」 */
const ROW_ICON_FONT_SIZE = 19;
/** 行高略大於字級，避免 Android 裁切 emoji */
const ROW_ICON_LINE_LEADING = 6;
const ROW_ICON_LINE_HEIGHT = ROW_ICON_FONT_SIZE + ROW_ICON_LINE_LEADING;
/** 圖示區塊內側留白（與字級分開，才能看出上下空隙） */
const ROW_ICON_CELL_PADDING_VERTICAL = 6;
const ROW_ICON_CELL_PADDING_HORIZONTAL = 4;
const ROW_ICON_MIN_WIDTH = 36;
const ROW_HEIGHT =
  ROW_VERTICAL_PADDING * 2 +
  ROW_ICON_LINE_HEIGHT +
  ROW_ICON_CELL_PADDING_VERTICAL * 2;
const SWAP_THRESHOLD_RATIO = 0.8;

type NavProp = NativeStackNavigationProp<MainStackParamList, 'CategorySettings'>;

interface DraggableCategoryRowProps {
  item: CategoryItem;
  index: number;
  totalItems: number;
  isLast: boolean;
  canDelete: boolean;
  defaultAccountSubtitle?: string;
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
  defaultAccountSubtitle,
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
      <View style={styles.rowIconWrap}>
        <Text
          style={styles.rowIcon}
          {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
        >
          {item.icon}
        </Text>
      </View>
      <View style={styles.rowLabelCol}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {item.label}
        </Text>
        {defaultAccountSubtitle != null && defaultAccountSubtitle !== '' ? (
          <Text style={styles.rowDefaultAccount} numberOfLines={1}>
            {defaultAccountSubtitle}
          </Text>
        ) : null}
      </View>
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allNonDeletedAccounts, setAllNonDeletedAccounts] = useState<Account[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('📌');
  const [editDefaultAccountId, setEditDefaultAccountId] = useState<string | undefined>(undefined);

  const list = activeTab === 'expense' ? expenseCategories : incomeCategories;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useFocusEffect(
    useCallback(() => {
      setModalVisible(false);
      setEditingItem(null);
      getStoredAccounts().then((list: Account[]) => {
        setAccounts(list.filter((a) => a.name.trim() !== '' && !a.isHidden && !a.isDeleted));
        setAllNonDeletedAccounts(list.filter((a) => a.name.trim() !== '' && !a.isDeleted));
      });
    }, [])
  );

  const openAdd = () => {
    setEditingItem(null);
    setEditLabel('');
    setEditIcon(CATEGORY_ICON_OPTIONS[0] ?? '📌');
    setEditDefaultAccountId(undefined);
    setModalVisible(true);
  };

  const openEdit = (item: CategoryItem) => {
    setEditingItem(item);
    setEditLabel(item.label);
    setEditIcon(item.icon);
    const validIds = new Set(allNonDeletedAccounts.map((a) => a.id));
    setEditDefaultAccountId(resolveEffectiveDefaultAccountId(item, validIds));
    setModalVisible(true);
  };

  const handleDelete = (item: CategoryItem) => {
    if (list.length <= MIN_CATEGORIES_COUNT) {
      Alert.alert('無法刪除', '至少需保留一個類別。');
      return;
    }
    Alert.alert(
      '刪除類別',
      `確定要刪除「${item.label}」嗎？已使用此類別的紀錄仍會顯示原本的類別名稱。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => {
            const tab = activeTab;
            updateCategories((prev) => {
              const curList = tab === 'expense' ? prev.expense : prev.income;
              const nextList = curList.map((c) =>
                c.key === item.key ? { ...c, deleted: true } : c
              );
              return {
                expense: tab === 'expense' ? nextList : prev.expense,
                income: tab === 'income' ? nextList : prev.income,
              };
            });
          },
        },
      ]
    );
  };

  const handleSaveCategory = () => {
    const label = editLabel.trim();
    if (!label) return;
    const tab = activeTab;
    const editing = editingItem;
    if (editing) {
      updateCategories((prev) => {
        const curList = tab === 'expense' ? prev.expense : prev.income;
        const nextList = curList.map((c) => {
          if (c.key !== editing.key) return c;
          const updated: CategoryItem = { ...c, label, icon: editIcon };
          if (editDefaultAccountId != null && editDefaultAccountId !== '') {
            updated.defaultAccountId = editDefaultAccountId;
          } else {
            delete updated.defaultAccountId;
          }
          return updated;
        });
        return {
          expense: tab === 'expense' ? nextList : prev.expense,
          income: tab === 'income' ? nextList : prev.income,
        };
      });
    } else {
      const key = newCustomCategoryKey();
      const newItem: CategoryItem = { key, label, icon: editIcon };
      if (editDefaultAccountId != null && editDefaultAccountId !== '') {
        newItem.defaultAccountId = editDefaultAccountId;
      }
      updateCategories((prev) => {
        const curList = tab === 'expense' ? prev.expense : prev.income;
        const nextList = [...curList, newItem];
        return {
          expense: tab === 'expense' ? nextList : prev.expense,
          income: tab === 'income' ? nextList : prev.income,
        };
      });
    }
    setModalVisible(false);
    setEditingItem(null);
  };

  const getDefaultAccountSubtitle = useCallback(
    (item: CategoryItem): string | undefined => {
      const id = item.defaultAccountId;
      if (id == null || id === '') return undefined;
      const validIds = new Set(allNonDeletedAccounts.map((a) => a.id));
      if (resolveEffectiveDefaultAccountId(item, validIds)) {
        const name = allNonDeletedAccounts.find((a) => a.id === id)?.name?.trim();
        return name ? `預設：${name}` : undefined;
      }
      return DEFAULT_ACCOUNT_INVALID;
    },
    [allNonDeletedAccounts],
  );

  const swapCategories = useCallback((index1: number, index2: number) => {
    const tab = activeTabRef.current;
    updateCategories((prev) => {
      const currentList = tab === 'expense' ? prev.expense : prev.income;
      if (
        index1 < 0 ||
        index1 >= currentList.length ||
        index2 < 0 ||
        index2 >= currentList.length
      ) {
        return prev;
      }
      const nextList = [...currentList];
      [nextList[index1], nextList[index2]] = [nextList[index2], nextList[index1]];
      return {
        expense: tab === 'expense' ? nextList : prev.expense,
        income: tab === 'income' ? nextList : prev.income,
      };
    });
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

      <GHScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
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
              defaultAccountSubtitle={getDefaultAccountSubtitle(item)}
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
      </GHScrollView>

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
            <Text style={styles.iconPickerLabel}>{LABEL_DEFAULT_ACCOUNT}</Text>
            <ScrollView
              style={styles.accountPickerScroll}
              contentContainerStyle={styles.accountPickerList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <TouchableOpacity
                style={[
                  styles.accountRow,
                  editDefaultAccountId == null && styles.accountRowSelected,
                ]}
                onPress={() => setEditDefaultAccountId(undefined)}
              >
                <Text
                  style={[
                    styles.accountRowText,
                    editDefaultAccountId == null && styles.accountRowTextSelected,
                  ]}
                >
                  {DEFAULT_ACCOUNT_NONE}
                </Text>
                {editDefaultAccountId == null ? (
                  <Ionicons name="checkmark" size={20} color="#2563eb" />
                ) : null}
              </TouchableOpacity>
              {accounts.map((a) => {
                const selected = editDefaultAccountId === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.accountRow, selected && styles.accountRowSelected]}
                    onPress={() => setEditDefaultAccountId(a.id)}
                  >
                    <Text
                      style={[styles.accountRowText, selected && styles.accountRowTextSelected]}
                      numberOfLines={1}
                    >
                      {a.name.trim()}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={20} color="#2563eb" /> : null}
                  </TouchableOpacity>
                );
              })}
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
    paddingVertical: ROW_VERTICAL_PADDING,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    minHeight: ROW_HEIGHT,
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
  rowIconWrap: {
    marginRight: 12,
    minWidth: ROW_ICON_MIN_WIDTH,
    paddingVertical: ROW_ICON_CELL_PADDING_VERTICAL,
    paddingHorizontal: ROW_ICON_CELL_PADDING_HORIZONTAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIcon: {
    fontSize: ROW_ICON_FONT_SIZE,
    lineHeight: ROW_ICON_LINE_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  rowLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  rowDefaultAccount: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
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
    height: '80%',
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
    maxHeight: 76,
    marginBottom: 12,
  },
  accountPickerScroll: {
    flex: 1,
    marginBottom: 16,
  },
  accountPickerList: {},
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  accountRowSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  accountRowText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    marginRight: 8,
  },
  accountRowTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
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
