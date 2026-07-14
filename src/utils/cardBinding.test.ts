import { describe, it, expect } from "vitest";
import {
  resolveBinding,
  isMonitoredApp,
  monitoredApps,
  DEFAULT_CARD_RULES,
  type CardRule,
} from "./cardBinding";

function rule(p: Partial<CardRule>): CardRule {
  return {
    id: "r",
    label: "",
    matchLast4: null,
    matchKeyword: null,
    matchApp: null,
    accountId: null,
    categoryKey: null,
    sortOrder: 0,
    ...p,
  };
}

describe("resolveBinding", () => {
  const rules = [
    rule({ id: "taishin", label: "台新", matchLast4: "7509", matchApp: "tw.com.taishinbank.ccapp", accountId: "acc-taishin", categoryKey: "food" }),
    rule({ id: "sinopac", label: "永豐", matchKeyword: "永豐", accountId: "acc-sinopac", categoryKey: "entertainment" }),
  ];

  it("末四碼優先命中", () => {
    const r = resolveBinding(rules, "7509", "jp.naver.line.android", "隨便的內文");
    expect(r.accountId).toBe("acc-taishin");
    expect(r.categoryKey).toBe("food");
    expect(r.label).toBe("台新");
  });

  it("無末四碼時用 App 套件命中", () => {
    const r = resolveBinding(rules, null, "tw.com.taishinbank.ccapp", "無關鍵字");
    expect(r.accountId).toBe("acc-taishin");
  });

  it("無末四碼、無 App 時用關鍵字命中內文", () => {
    const r = resolveBinding(rules, null, "jp.naver.line.android", "永豐銀行 刷卡通知");
    expect(r.accountId).toBe("acc-sinopac");
    expect(r.label).toBe("永豐");
  });

  it("末四碼優先於關鍵字（內文含永豐但末四碼是台新）", () => {
    const r = resolveBinding(rules, "7509", null, "這段有永豐字樣");
    expect(r.label).toBe("台新");
  });

  it("全部不中 -> null", () => {
    const r = resolveBinding(rules, "0000", "com.other", "沒有任何關鍵字");
    expect(r.accountId).toBeNull();
    expect(r.categoryKey).toBeNull();
    expect(r.label).toBeNull();
  });
});

describe("monitoredApps / isMonitoredApp（自動記帳白名單）", () => {
  const seeded: CardRule[] = DEFAULT_CARD_RULES.map((r, i) => ({ id: `s${i}`, ...r }));

  it("白名單＝規則裡設定過的 match_app", () => {
    expect(monitoredApps(seeded)).toEqual(
      new Set(["tw.com.taishinbank.ccapp", "com.sinopac.dawho"]),
    );
  });

  it("有設定的銀行 App → 監聽", () => {
    expect(isMonitoredApp("tw.com.taishinbank.ccapp", seeded)).toBe(true);
    expect(isMonitoredApp("com.sinopac.dawho", seeded)).toBe(true);
  });

  it("沒設定的 App（含 LINE、隨機推播）→ 不監聽", () => {
    expect(isMonitoredApp("jp.naver.line.android", seeded)).toBe(false);
    expect(isMonitoredApp("com.some.random.app", seeded)).toBe(false);
  });

  it("app 為 null / 空字串 → 不監聽", () => {
    expect(isMonitoredApp(null, seeded)).toBe(false);
    expect(isMonitoredApp("", seeded)).toBe(false);
  });

  it("只用末四碼/關鍵字（沒填 App）的規則不會進白名單", () => {
    const rules = [
      rule({ matchLast4: "7509" }),
      rule({ matchKeyword: "刷卡" }),
      rule({ matchApp: "  " }),
    ];
    expect(monitoredApps(rules).size).toBe(0);
    expect(isMonitoredApp("tw.com.taishinbank.ccapp", rules)).toBe(false);
  });

  it("沒有任何規則 → 白名單為空，全部不監聽", () => {
    expect(isMonitoredApp("tw.com.taishinbank.ccapp", [])).toBe(false);
  });
});
