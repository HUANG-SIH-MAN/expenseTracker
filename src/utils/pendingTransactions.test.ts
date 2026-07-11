import { describe, it, expect } from "vitest";
import { decidePendingInsert, type DedupItem } from "./pendingDedup";

function item(p: Partial<DedupItem>): DedupItem {
  return {
    id: "x",
    bank: "永豐",
    source: "line",
    amount: 100,
    merchant: null,
    last4: null,
    occurredAt: "2026-07-11T12:10:00.000Z",
    ...p,
  };
}

describe("decidePendingInsert", () => {
  it("空清單 -> 直接加入", () => {
    const r = decidePendingInsert(item({}), []);
    expect(r.insert).toBe(true);
    expect(r.supersedeIds).toEqual([]);
  });

  it("LINE 重複貼出（同管道同金額同內容、時間相近）-> 丟棄", () => {
    const existing = [
      item({ id: "a", bank: "永豐", source: "line", amount: 65, merchant: "大全聯", last4: "6908", occurredAt: "2026-07-11T12:10:00.000Z" }),
    ];
    const cand = item({ bank: "永豐", source: "line", amount: 65, merchant: "大全聯", last4: "6908", occurredAt: "2026-07-11T12:10:00.000Z" });
    expect(decidePendingInsert(cand, existing).insert).toBe(false);
  });

  it("台新 App 已存在，來了 LINE Pay 同筆 -> 丟棄 LINE Pay", () => {
    const existing = [
      item({ id: "taishin", bank: "台新", source: "app", amount: 79, merchant: null, last4: "7509", occurredAt: "2026-07-11T11:40:00.000Z" }),
    ];
    const linePay = item({ bank: "LINE Pay", source: "line", amount: 79, merchant: "IKEA宜家家居", last4: null, occurredAt: "2026-07-11T11:40:49.000Z" });
    const r = decidePendingInsert(linePay, existing);
    expect(r.insert).toBe(false);
  });

  it("LINE Pay 已存在，來了台新 App 同筆 -> 加入台新並取代 LINE Pay", () => {
    const existing = [
      item({ id: "linepay", bank: "LINE Pay", source: "line", amount: 79, merchant: "IKEA宜家家居", last4: null, occurredAt: "2026-07-11T11:40:49.000Z" }),
    ];
    const taishin = item({ bank: "台新", source: "app", amount: 79, merchant: null, last4: "7509", occurredAt: "2026-07-11T11:40:00.000Z" });
    const r = decidePendingInsert(taishin, existing);
    expect(r.insert).toBe(true);
    expect(r.supersedeIds).toEqual(["linepay"]);
  });

  it("不同金額 -> 視為不同筆，都加入", () => {
    const existing = [item({ id: "a", amount: 65 })];
    expect(decidePendingInsert(item({ amount: 79 }), existing).insert).toBe(true);
  });

  it("金額相同但時間差很遠 -> 視為不同筆", () => {
    const existing = [
      item({ id: "a", bank: "台新", source: "app", amount: 79, occurredAt: "2026-07-11T09:00:00.000Z" }),
    ];
    const linePay = item({ bank: "LINE Pay", source: "line", amount: 79, occurredAt: "2026-07-11T11:40:49.000Z" });
    expect(decidePendingInsert(linePay, existing).insert).toBe(true);
  });

  it("不同銀行同金額相近時間（永豐 vs 台新）-> 不誤合併", () => {
    const existing = [
      item({ id: "a", bank: "永豐", source: "line", amount: 79, occurredAt: "2026-07-11T11:40:10.000Z" }),
    ];
    const taishin = item({ bank: "台新", source: "app", amount: 79, occurredAt: "2026-07-11T11:40:00.000Z" });
    const r = decidePendingInsert(taishin, existing);
    expect(r.insert).toBe(true);
    expect(r.supersedeIds).toEqual([]);
  });
});
