/**
 * 換匯／轉帳：記錄台幣與外幣之間的轉帳，並儲存匯率
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Account, TransferTemplate, TransferTemplateLinkedTx } from "../types";
import { generateId } from "../utils/id";
import { formatDateWithWeekday } from "../utils/date";
import { useTransactions } from "../contexts/TransactionsContext";
import { useCategories } from "../contexts/CategoriesContext";
import {
  getStoredAccounts,
  getStoredPrimaryCurrency,
  getTransferTemplates,
} from "../utils/storage";
import type { MainStackParamList } from "../navigation/MainStack";
import Calendar from "../components/Calendar";
import Ionicons from "@expo/vector-icons/Ionicons";

const BACK_ICON_SIZE = 28;
const TITLE_NEW = "換匯／轉帳";
const TITLE_EDIT = "編輯轉帳";
const LABEL_FROM = "轉出帳戶";
const LABEL_TO = "轉入帳戶";
const LABEL_AMOUNT_FROM = "轉出金額";
const LABEL_AMOUNT_TO = "轉入金額";
const LABEL_DATE = "日期";
const LABEL_NOTE = "備註（選填）";
const BTN_SAVE = "儲存";
const CATEGORY_TRANSFER = "transfer";

type RouteProps = NativeStackScreenProps<MainStackParamList, "AddTransfer">["route"];

function formatAmountInput(s: string): string {
  return s.replace(/[^0-9.-]/g, "");
}

export default function AddTransferScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const selectedDate =
    (route.params && "selectedDate" in route.params && route.params.selectedDate) ||
    new Date().toISOString().slice(0, 10);
  const { addTransactions, updateTransaction, getTransactionById } = useTransactions();
  const { getCategoryLabel } = useCategories();
  const transactionId =
    (route.params && "transactionId" in route.params && route.params.transactionId) || undefined;
  const existing = transactionId ? getTransactionById(transactionId) : undefined;
  const isEditMode = Boolean(existing);
  const isLocked = Boolean(existing?.lockedReason);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>("TWD");
  const [fromAccountId, setFromAccountId] = useState<string | undefined>();
  const [toAccountId, setToAccountId] = useState<string | undefined>();
  const [dateKey, setDateKey] = useState(selectedDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerYear, setDatePickerYear] = useState(() => parseInt(selectedDate.slice(0, 4)));
  const [datePickerMonth, setDatePickerMonth] = useState(() => parseInt(selectedDate.slice(5, 7)));
  const [amountFromStr, setAmountFromStr] = useState("");
  const [amountToStr, setAmountToStr] = useState("");
  const [note, setNote] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [templates, setTemplates] = useState<TransferTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null);
  const [linkedTxsPreview, setLinkedTxsPreview] = useState<TransferTemplateLinkedTx[]>([]);

  useEffect(() => {
    getStoredPrimaryCurrency().then(setPrimaryCurrency);
    getTransferTemplates().then(setTemplates);
  }, []);

  // 編輯模式：prefill 金額、日期、備註
  useEffect(() => {
    if (!existing) return;
    setAmountFromStr(String(existing.amount));
    setAmountToStr(String(existing.transferAmount ?? existing.amount));
    setDateKey(existing.date);
    setNote(existing.note ?? '');
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getStoredAccounts().then((list: Account[]) => {
      // 編輯模式下也顯示已刪除帳戶（舊紀錄可能綁定已刪帳戶）
      const valid = list.filter((a: Account) => a.name.trim() !== "");
      setAccounts(valid);
      if (existing) {
        // 編輯模式：優先用既有交易的帳戶
        setFromAccountId(existing.accountId);
        setToAccountId(existing.toAccountId);
      } else {
        const active = valid.filter((a) => !a.isDeleted);
        if (active.length > 0 && !fromAccountId) setFromAccountId(active[0].id);
        if (active.length > 1 && !toAccountId) setToAccountId(active[1]?.id ?? active[0].id);
      }
    });
  }, []);

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const fromCurrency = fromAccount?.currency ?? "TWD";
  const toCurrency = toAccount?.currency ?? "TWD";

  const amountFrom = parseFloat(amountFromStr) || 0;
  const amountTo = parseFloat(amountToStr) || 0;

  // 由兩邊金額推算匯率，以主幣別角度顯示
  const rateDisplayText = useCallback((): string | null => {
    if (fromCurrency === toCurrency) return null;
    if (amountFrom <= 0 || amountTo <= 0) return null;
    const fromIsPrimary = fromCurrency === primaryCurrency;
    const toIsPrimary = toCurrency === primaryCurrency;
    if (fromIsPrimary) {
      // from=TWD, to=USD → 1 USD = amountFrom/amountTo TWD
      const r = parseFloat((amountFrom / amountTo).toFixed(4));
      return `1 ${toCurrency} = ${r} ${primaryCurrency}`;
    } else if (toIsPrimary) {
      // from=USD, to=TWD → 1 USD = amountTo/amountFrom TWD
      const r = parseFloat((amountTo / amountFrom).toFixed(4));
      return `1 ${fromCurrency} = ${r} ${primaryCurrency}`;
    } else {
      // 交叉匯率：1 fromCurrency = amountFrom/amountTo toCurrency
      const r = parseFloat((amountFrom / amountTo).toFixed(4));
      return `1 ${fromCurrency} = ${r} ${toCurrency}`;
    }
  }, [fromCurrency, toCurrency, amountFrom, amountTo, primaryCurrency]);

  const canSave =
    !isLocked &&
    fromAccountId &&
    toAccountId &&
    fromAccountId !== toAccountId &&
    amountFrom > 0 &&
    amountTo > 0;

  const handleSave = () => {
    if (!canSave || !fromAccountId || !toAccountId) return;
    const now = new Date().toISOString();
    if (isEditMode && existing) {
      updateTransaction({
        ...existing,
        amount: amountFrom,
        date: dateKey,
        note: note.trim() || undefined,
        accountId: fromAccountId,
        toAccountId,
        transferAmount: amountTo,
      });
      navigation.goBack();
      return;
    }
    const transferTx = {
      id: generateId(),
      type: "transfer" as const,
      amount: amountFrom,
      date: dateKey,
      category: CATEGORY_TRANSFER,
      note: note.trim() || undefined,
      accountId: fromAccountId,
      toAccountId,
      transferAmount: amountTo,
      createdAt: now,
    };
    const extraTxs = linkedTxsPreview.map((lt) => ({
      id: generateId(),
      type: lt.type,
      amount: lt.amount,
      date: dateKey,
      category: lt.category,
      note: lt.note || undefined,
      accountId: lt.accountId,
      createdAt: now,
    }));
    addTransactions([transferTx, ...extraTxs]);
    navigation.popToTop();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={BACK_ICON_SIZE} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditMode ? TITLE_EDIT : TITLE_NEW}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSave}
          style={styles.saveBtn}
        >
          <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
            {BTN_SAVE}
          </Text>
        </TouchableOpacity>
      </View>

      {isLocked && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>🔒 此交易為系統自動建立，無法編輯</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {!isEditMode && templates.length > 0 && (
          <View style={styles.field}>
            {activeTemplateName == null ? (
              <TouchableOpacity
                style={styles.templateBtn}
                onPress={() => setShowTemplatePicker(true)}
              >
                <Ionicons name="copy-outline" size={18} color="#2563eb" />
                <Text style={styles.templateBtnText}>使用模板</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.templateActive}>
                <Ionicons name="copy" size={16} color="#2563eb" />
                <Text style={styles.templateActiveName} numberOfLines={1}>模板：{activeTemplateName}</Text>
                <TouchableOpacity
                  hitSlop={8}
                  onPress={() => {
                    setActiveTemplateName(null);
                    setLinkedTxsPreview([]);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#6b7280" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.field}
          onPress={() => {
            setDatePickerYear(parseInt(dateKey.slice(0, 4)));
            setDatePickerMonth(parseInt(dateKey.slice(5, 7)));
            setShowDatePicker(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.label}>{LABEL_DATE}</Text>
          <View style={styles.dateValueRow}>
            <Text style={styles.dateText}>{formatDateWithWeekday(dateKey)}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </View>
        </TouchableOpacity>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_FROM}</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowFromPicker(true)}
          >
            <Text style={styles.pickerBtnText} numberOfLines={1}>
              {fromAccount ? `${fromAccount.name} (${fromCurrency})` : "選擇"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_TO}</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowToPicker(true)}
          >
            <Text style={styles.pickerBtnText} numberOfLines={1}>
              {toAccount ? `${toAccount.name} (${toCurrency})` : "選擇"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_AMOUNT_FROM} ({fromCurrency})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            value={amountFromStr}
            onChangeText={(t) => setAmountFromStr(formatAmountInput(t))}
          />
        </View>

        {rateDisplayText() != null && (
          <Text style={styles.rateHint}>{rateDisplayText()}</Text>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_AMOUNT_TO} ({toCurrency})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            value={amountToStr}
            onChangeText={(t) => setAmountToStr(formatAmountInput(t))}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LABEL_NOTE}</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="選填"
            placeholderTextColor="#9ca3af"
            value={note}
            onChangeText={setNote}
          />
        </View>

        {linkedTxsPreview.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>同時建立</Text>
            <View style={styles.linkedPreviewBlock}>
              {linkedTxsPreview.map((tx, i) => {
                const accountName = accounts.find((a) => a.id === tx.accountId)?.name;
                return (
                  <View key={i} style={[styles.linkedPreviewRow, i === linkedTxsPreview.length - 1 && styles.linkedPreviewRowLast]}>
                    <View style={[styles.linkedTypeBadge, { backgroundColor: tx.type === 'income' ? '#dcfce7' : '#fee2e2' }]}>
                      <Text style={[styles.linkedTypeBadgeText, { color: tx.type === 'income' ? '#166534' : '#991b1b' }]}>
                        {tx.type === 'income' ? '收入' : '支出'}
                      </Text>
                    </View>
                    <Text style={styles.linkedPreviewAmount}>{tx.amount}</Text>
                    <Text style={styles.linkedPreviewSub} numberOfLines={1}>
                      {getCategoryLabel(tx.type, tx.category)}{accountName ? `・${accountName}` : ''}{tx.note ? `・${tx.note}` : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {showFromPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{LABEL_FROM}</Text>
            <ScrollView style={styles.modalScroll} bounces={false}>
              {accounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.modalRow}
                  onPress={() => {
                    setFromAccountId(a.id);
                    setShowFromPicker(false);
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {a.name} ({a.currency ?? "TWD"})
                  </Text>
                  {fromAccountId === a.id && <Text style={styles.modalRowCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowFromPicker(false)}>
              <Text style={styles.modalCloseText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showToPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{LABEL_TO}</Text>
            <ScrollView style={styles.modalScroll} bounces={false}>
              {accounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.modalRow}
                  onPress={() => {
                    setToAccountId(a.id);
                    setShowToPicker(false);
                  }}
                >
                  <Text style={styles.modalRowText}>
                    {a.name} ({a.currency ?? "TWD"})
                  </Text>
                  {toAccountId === a.id && <Text style={styles.modalRowCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowToPicker(false)}>
              <Text style={styles.modalCloseText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showTemplatePicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>選擇模板</Text>
            {templates.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.modalRow}
                onPress={() => {
                  if (t.fromAccountId) setFromAccountId(t.fromAccountId);
                  if (t.toAccountId) setToAccountId(t.toAccountId);
                  if (t.defaultAmount != null) {
                    setAmountFromStr(String(t.defaultAmount));
                    setAmountToStr(String(t.defaultAmount));
                  }
                  setLinkedTxsPreview(t.linkedTransactions);
                  setActiveTemplateName(t.name);
                  setShowTemplatePicker(false);
                }}
              >
                <View style={styles.templateModalRow}>
                  <Text style={styles.modalRowText}>{t.name}</Text>
                  {t.linkedTransactions.length > 0 && (
                    <Text style={styles.templateModalSub}>附加 {t.linkedTransactions.length} 筆</Text>
                  )}
                </View>
                {activeTemplateName === t.name && <Text style={styles.modalRowCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowTemplatePicker(false)}>
              <Text style={styles.modalCloseText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showDatePicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.dateModalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.dateModalCard}>
            <View style={styles.dateModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  const d = new Date(datePickerYear, datePickerMonth - 2, 1);
                  setDatePickerYear(d.getFullYear());
                  setDatePickerMonth(d.getMonth() + 1);
                }}
                style={styles.dateModalNavBtn}
              >
                <Ionicons name="chevron-back" size={20} color="#1a1a1a" />
              </TouchableOpacity>
              <Text style={styles.dateModalTitle}>{datePickerYear} 年 {datePickerMonth} 月</Text>
              <TouchableOpacity
                onPress={() => {
                  const d = new Date(datePickerYear, datePickerMonth, 1);
                  setDatePickerYear(d.getFullYear());
                  setDatePickerMonth(d.getMonth() + 1);
                }}
                style={styles.dateModalNavBtn}
              >
                <Ionicons name="chevron-forward" size={20} color="#1a1a1a" />
              </TouchableOpacity>
            </View>
            <Calendar
              year={datePickerYear}
              month={datePickerMonth}
              selectedDate={dateKey}
              onSelectDate={(d) => {
                setDateKey(d);
                setShowDatePicker(false);
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: "600", color: "#1f2937" },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  saveBtnText: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
  saveBtnTextDisabled: { color: "#9ca3af" },
  lockedBanner: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#fde68a",
  },
  lockedBannerText: { fontSize: 13, color: "#92400e" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 },
  dateText: { fontSize: 16, color: "#1f2937" },
  pickerBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerBtnText: { fontSize: 16, color: "#1f2937" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  noteInput: { minHeight: 80, textAlignVertical: "top" },
  rateHint: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
    marginTop: -12,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    maxWidth: 320,
    maxHeight: "80%",
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12, color: "#1f2937" },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalRowText: { fontSize: 16, color: "#374151" },
  modalRowCheck: { fontSize: 16, color: "#2563eb" },
  modalClose: { marginTop: 12, paddingVertical: 12, alignItems: "center" },
  modalCloseText: { fontSize: 16, color: "#2563eb" },
  templateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    alignSelf: "flex-start",
  },
  templateBtnText: { fontSize: 15, fontWeight: "600", color: "#2563eb" },
  templateActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  templateActiveName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#2563eb" },
  linkedPreviewBlock: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  linkedPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  linkedPreviewRowLast: { borderBottomWidth: 0 },
  linkedTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  linkedTypeBadgeText: { fontSize: 11, fontWeight: "600" },
  linkedPreviewAmount: { fontSize: 15, fontWeight: "600", color: "#1f2937", marginRight: 4 },
  linkedPreviewSub: { flex: 1, fontSize: 13, color: "#6b7280" },
  templateModalRow: { flex: 1 },
  templateModalSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  dateValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dateModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  dateModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: 320,
  },
  dateModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dateModalNavBtn: { padding: 6 },
  dateModalTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
});
