/**
 * 匯率設定頁：顯示各幣別對主幣別匯率、最後更新時間、「立即更新」按鈕
 */
import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MainStackParamList } from "../navigation/MainStack";
import type { CurrencyCode, CurrencyOption } from "../types";
import {
  getExchangeRates,
  saveExchangeRates,
  getStoredPrimaryCurrency,
  getCurrencyOptions,
} from "../utils/storage";
import { fetchRatesToPrimary } from "../utils/exchangeRate";

const TITLE = "匯率";
const BACK_ICON_SIZE = 28;
const LABEL_LAST_UPDATED = "最後更新";
const BTN_UPDATE = "立即更新";

type NavProp = NativeStackNavigationProp<MainStackParamList, "ExchangeRates">;

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ExchangeRatesScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const [primaryCurrency, setPrimaryCurrency] = useState<CurrencyCode>("TWD");
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyOption[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState("");
  const [updating, setUpdating] = useState(false);

  const loadRates = useCallback(async () => {
    const [primary, options, data] = await Promise.all([
      getStoredPrimaryCurrency(),
      getCurrencyOptions(),
      getExchangeRates(),
    ]);
    setPrimaryCurrency(primary);
    setCurrencyOptions(options);
    setRates(data.rates ?? {});
    setUpdatedAt(data.updatedAt ?? "");
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRates();
    }, [loadRates])
  );

  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    const codes = currencyOptions.map((o) => o.code);
    const newRates = await fetchRatesToPrimary(primaryCurrency, codes);
    if (newRates != null) {
      await saveExchangeRates(newRates);
      setRates(newRates);
      setUpdatedAt(new Date().toISOString());
    }
    setUpdating(false);
  }, [primaryCurrency, currencyOptions]);

  const primaryOption = currencyOptions.find((o) => o.code === primaryCurrency);
  const primaryLabel = primaryOption?.label ?? primaryCurrency;

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.primaryLabel}>
          主幣別：{primaryLabel}
        </Text>
        <View style={styles.updatedRow}>
          <Text style={styles.updatedLabel}>{LABEL_LAST_UPDATED}</Text>
          <Text style={styles.updatedValue}>{formatDateTime(updatedAt)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.updateBtn, updating && styles.updateBtnDisabled]}
          onPress={handleUpdate}
          disabled={updating}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.updateBtnText}>{BTN_UPDATE}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.rateList}>
          {currencyOptions.map((opt) => {
            const rate = opt.code === primaryCurrency ? 1 : (rates[opt.code] ?? 0);
            return (
              <View key={opt.code} style={styles.rateRow}>
                <Text style={styles.rateCode}>{opt.label}</Text>
                <Text style={styles.rateValue}>
                  1 {opt.code} = {rate > 0 ? rate.toFixed(4) : "—"} {primaryCurrency}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  backBtn: { paddingVertical: 8, paddingRight: 16 },
  title: { fontSize: 18, fontWeight: "600", color: "#1f2937" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  primaryLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  updatedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  updatedLabel: { fontSize: 14, color: "#6b7280", marginRight: 8 },
  updatedValue: { fontSize: 14, color: "#1f2937" },
  updateBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 24,
  },
  updateBtnDisabled: { backgroundColor: "#9ca3af" },
  updateBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  rateList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rateCode: { fontSize: 15, color: "#374151", fontWeight: "500" },
  rateValue: { fontSize: 14, color: "#6b7280" },
});
