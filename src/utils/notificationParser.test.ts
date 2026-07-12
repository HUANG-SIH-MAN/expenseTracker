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

  it("解析金額、末四碼、來源；台新 App 無商店名", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(79);
    expect(r!.last4).toBe("7509");
    expect(r!.merchant).toBeNull();
    expect(r!.source).toBe("app");
    expect(r!.bank).toBe("信用卡消費通知"); // bank 取自標題，最終顯示名由設定覆蓋
  });

  it("解析消費時間為 07/11 11:40", () => {
    const d = new Date(parseNotification(n)!.occurredAt);
    expect(d.getMonth() + 1).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(40);
  });
});

describe("parseNotification - 永豐（走 LINE）", () => {
  const n = make({
    app: "jp.naver.line.android",
    title: "永豐銀行",
    text: "永豐貴賓您好，末四碼6908感謝07/11 12:10刷卡台幣65元，商店名稱:大全聯，實際商店名稱",
    capturedAt: "2026-07-11T12:10:30.000Z",
  });

  it("解析金額、末四碼、商店名、來源", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(65);
    expect(r!.last4).toBe("6908");
    expect(r!.merchant).toBe("大全聯");
    expect(r!.source).toBe("line");
    expect(r!.bank).toBe("永豐銀行");
  });
});

describe("parseNotification - LINE Pay（走 LINE）", () => {
  const n = make({
    app: "jp.naver.line.android",
    title: "LINE錢包",
    text: "LINE Pay 付款 NT$ 79 付款完成。\n商店名稱: IKEA宜家家居",
    capturedAt: "2026-07-11T11:40:49.000Z",
  });

  it("解析金額、商店名；無末四碼", () => {
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(79);
    expect(r!.merchant).toBe("IKEA宜家家居");
    expect(r!.last4).toBeNull();
    expect(r!.source).toBe("line");
  });
});

describe("parseNotification - 通用（未內建的銀行也能解析）", () => {
  it("富邦：末四碼 + NTD 金額 + 在X消費", () => {
    const n = make({
      app: "com.fubon.card",
      title: "富邦信用卡",
      text: "您的富邦信用卡末四碼1234於07/12 14:30在家樂福消費NTD1,250元",
      capturedAt: "2026-07-12T14:31:00.000Z",
    });
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1250);
    expect(r!.last4).toBe("1234");
    expect(r!.merchant).toBe("家樂福");
    expect(r!.bank).toBe("富邦信用卡");
  });

  it("星展：尾號 + TWD 金額，無商店名", () => {
    const n = make({
      app: "com.dbs.card",
      title: "星展銀行",
      text: "您尾號5678的星展信用卡於07/12 20:15消費TWD 899",
      capturedAt: "2026-07-12T20:16:00.000Z",
    });
    const r = parseNotification(n);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(899);
    expect(r!.last4).toBe("5678");
    expect(r!.merchant).toBeNull();
  });

  it("金額含千分位逗號", () => {
    const n = make({
      app: "tw.com.taishinbank.ccapp",
      text: "您的卡(末四碼7509)於07/11-11:40刷卡消費約新臺幣12,345元",
      capturedAt: "2026-07-11T11:41:00.000Z",
    });
    expect(parseNotification(n)!.amount).toBe(12345);
  });
});

describe("parseNotification - 非消費/無法解析", () => {
  it("一般 LINE 聊天訊息 -> null", () => {
    expect(
      parseNotification(make({ app: "jp.naver.line.android", title: "小明", text: "晚上要吃什麼？" })),
    ).toBeNull();
  });

  it("帳單/繳款提醒（有金額但非單筆消費）-> null", () => {
    const n = make({
      app: "jp.naver.line.android",
      title: "永豐銀行",
      text: "您的信用卡本期帳單應繳金額新臺幣5,000元，繳款截止日07/25。",
    });
    expect(parseNotification(n)).toBeNull();
  });

  it("有金額但無末四碼也無刷卡關鍵字 -> null", () => {
    const n = make({ app: "com.some.app", title: "促銷", text: "限時優惠只要99元" });
    expect(parseNotification(n)).toBeNull();
  });
});
