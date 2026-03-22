import { describe, expect, it } from "vitest";
import {
  resolveCategoriesForImport,
  type ParsedSourceRow,
} from "./csvImportExport";
import type { StoredCategories } from "../types";

const baseRow: ParsedSourceRow = {
  date: "2025-01-01",
  type: "expense",
  amount: 100,
  categoryName: "其他",
  accountName: "現金",
  note: "",
  lastUpdated: "2025-01-01",
};

function row(partial: Partial<ParsedSourceRow>): ParsedSourceRow {
  return { ...baseRow, ...partial };
}

describe("resolveCategoriesForImport", () => {
  it("T1: expense 列表已有 label 自訂餐飲 時，不新增且解析得既有 key", () => {
    const existing: StoredCategories = {
      expense: [{ key: "custom-meal", label: "自訂餐飲", icon: "🍽️" }],
      income: [],
    };
    const rows = [row({ categoryName: "自訂餐飲" })];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense).toHaveLength(existing.expense.length);
    expect(resolveCategoryKey("expense", "自訂餐飲")).toBe("custom-meal");
  });

  it("T2: expense 預設 food（label 飲食），CSV 飲食 → R1 label 命中 → key food", () => {
    const existing: StoredCategories = {
      expense: [{ key: "food", label: "飲食", icon: "🍽️" }],
      income: [],
    };
    const rows = [row({ categoryName: "飲食" })];
    const { resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(resolveCategoryKey("expense", "飲食")).toBe("food");
  });

  it("T3: 無 label 命中；對照表 飲食→food 且列表存在 food → 用 food，不新建", () => {
    const existing: StoredCategories = {
      expense: [{ key: "food", label: "餐飲", icon: "🍽️" }],
      income: [],
    };
    const rows = [row({ categoryName: "飲食" })];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense).toHaveLength(1);
    expect(resolveCategoryKey("expense", "飲食")).toBe("food");
  });

  it("T4: 列表無 food（僅 other），CSV 飲食 → 對照表得 food 但列表無該 key → 新建，label 為飲食", () => {
    const existing: StoredCategories = {
      expense: [{ key: "other", label: "其他", icon: "📌" }],
      income: [],
    };
    const rows = [row({ categoryName: "飲食" })];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense).toHaveLength(2);
    const created = mergedCategories.expense.find((c) => c.label === "飲食");
    expect(created).toBeDefined();
    expect(created?.key).not.toBe("food");
    expect(resolveCategoryKey("expense", "飲食")).toBe(created?.key);
  });

  it("T5: 對照表無，CSV 神秘類別 → 新建，label 神秘類別", () => {
    const existing: StoredCategories = {
      expense: [{ key: "other", label: "其他", icon: "📌" }],
      income: [],
    };
    const rows = [row({ categoryName: "神秘類別" })];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense).toHaveLength(2);
    const created = mergedCategories.expense.find((c) => c.label === "神秘類別");
    expect(created).toBeDefined();
    expect(resolveCategoryKey("expense", "神秘類別")).toBe(created?.key);
  });

  it("T6: 兩列同 (type, categoryName) 需新建時，僅一筆新類別", () => {
    const existing: StoredCategories = {
      expense: [{ key: "other", label: "其他", icon: "📌" }],
      income: [],
    };
    const rows = [
      row({ categoryName: "神秘類別" }),
      row({ categoryName: "神秘類別", date: "2025-01-02" }),
    ];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense.filter((c) => c.label === "神秘類別")).toHaveLength(1);
    expect(mergedCategories.expense).toHaveLength(2);
    const k = resolveCategoryKey("expense", "神秘類別");
    expect(resolveCategoryKey("expense", "神秘類別")).toBe(k);
  });

  it("T7: 靜態表將保險→other 時，不得併入既有「其他」；應新建 label 保險", () => {
    const existing: StoredCategories = {
      expense: [{ key: "other", label: "其他", icon: "📌" }],
      income: [],
    };
    const rows = [row({ categoryName: "保險" })];
    const { mergedCategories, resolveCategoryKey } = resolveCategoriesForImport(existing, rows);
    expect(mergedCategories.expense).toHaveLength(2);
    const insurance = mergedCategories.expense.find((c) => c.label === "保險");
    expect(insurance).toBeDefined();
    expect(resolveCategoryKey("expense", "保險")).toBe(insurance?.key);
    expect(resolveCategoryKey("expense", "保險")).not.toBe("other");
  });
});
