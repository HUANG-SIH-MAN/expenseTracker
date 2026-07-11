import { describe, it, expect } from "vitest";
import { parseNotification, type ParsableNotification } from "./notificationParser";

function make(partial: Partial<ParsableNotification>): ParsableNotification {
  return {
    app: null,
    title: null,
    text: null,
    bigText: null,
    capturedAt: "2026-07-11T12:00:00.000Z",
    ...partial,
  };
}

describe("parseNotification - 台新 App", () => {
  const n = make({
    app: "tw.com.taishinbank.ccapp",
    title: "信用卡消費通知",
    text: "【信用卡消費通知】您的Richart卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣79元，實際消費資訊以帳單為準，如有疑問請洽客服",
    capturedAt: "2026-07-11T11:41:07.000Z",
  });

  it("解析金額、末四碼、銀行、來源", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(79);
    expect(r!.last4).toBe("7509");
    expect(r!.currency).toBe("TWD");
    expect(r!.bank).toBe("台新");
    expect(r!.source).toBe("app");
  });

  it("台新 App 通知無商店名 -> merchant 為 null", () => {
    expect(parseNotification(n)!.merchant).toBeNull();
  });

  it("解析消費時間為 07/11 11:40", () => {
    const d = new Date(parseNotification(n)!.occurredAt);
    expect(d.getMonth() + 1).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(40);
  });

  it("金額含千分位逗號可解析", () => {
    const big = make({
      app: "tw.com.taishinbank.ccapp",
      text: "您的Richart卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣1,234元",
      capturedAt: "2026-07-11T11:41:07.000Z",
    });
    expect(parseNotification(big)!.amount).toBe(1234);
  });
});

describe("parseNotification - 永豐（走 LINE）", () => {
  const n = make({
    app: "jp.naver.line.android",
    title: "永豐銀行",
    text: "永豐貴賓您好，末四碼6908感謝07/11 12:10刷卡台幣65元，商店名稱:大全聯，實際商店名稱",
    capturedAt: "2026-07-11T12:10:30.000Z",
  });

  it("解析金額、末四碼、商店名、銀行、來源", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(65);
    expect(r!.last4).toBe("6908");
    expect(r!.merchant).toBe("大全聯");
    expect(r!.bank).toBe("永豐");
    expect(r!.source).toBe("line");
  });

  it("解析消費時間為 07/11 12:10", () => {
    const d = new Date(parseNotification(n)!.occurredAt);
    expect(d.getMonth() + 1).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(10);
  });
});

describe("parseNotification - LINE Pay（走 LINE）", () => {
  const n = make({
    app: "jp.naver.line.android",
    title: "LINE錢包",
    text: "LINE Pay 付款 NT$ 79 付款完成。\n商店名稱: IKEA宜家家居",
    capturedAt: "2026-07-11T11:40:49.000Z",
  });

  it("解析金額、商店名、來源；無末四碼", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(79);
    expect(r!.merchant).toBe("IKEA宜家家居");
    expect(r!.last4).toBeNull();
    expect(r!.bank).toBe("LINE Pay");
    expect(r!.source).toBe("line");
  });
});

describe("parseNotification - 非消費/無法解析", () => {
  it("一般 LINE 聊天訊息 -> null", () => {
    const n = make({
      app: "jp.naver.line.android",
      title: "小明",
      text: "晚上要吃什麼？",
    });
    expect(parseNotification(n)).toBeNull();
  });

  it("未知 app -> null", () => {
    const n = make({ app: "com.whatever.app", text: "刷卡台幣100元" });
    expect(parseNotification(n)).toBeNull();
  });

  it("永豐通知但缺金額 -> null", () => {
    const n = make({
      app: "jp.naver.line.android",
      title: "永豐銀行",
      text: "永豐貴賓您好，您的帳單已出。",
    });
    expect(parseNotification(n)).toBeNull();
  });
});
