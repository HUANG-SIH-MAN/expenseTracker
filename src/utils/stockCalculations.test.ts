import { afterEach, describe, expect, it, vi } from "vitest";
import type { StockPriceCache, StockTransaction } from "../types";
import { applyDividendReinvestToNote } from "./stockDividendReinvest";
import {
  buildPortfolioXIRRCashFlows,
  calcPortfolioXIRR,
  calcXIRR,
} from "./stockCalculations";

function makeTx(overrides: Partial<StockTransaction>): StockTransaction {
  return {
    id: "tx",
    ticker: "2330",
    name: "TSMC",
    date: "2024-01-01",
    type: "buy",
    shares: 1,
    priceNative: 100,
    twdCost: 100,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("portfolio XIRR", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches XIRR from aggregated portfolio cash flows and current value", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

    const transactions: StockTransaction[] = [
      makeTx({
        id: "buy-1",
        date: "2024-01-01",
        ticker: "2330",
        shares: 10,
        priceNative: 100,
        twdCost: 1000,
      }),
      makeTx({
        id: "buy-2",
        date: "2024-07-01",
        ticker: "AAPL",
        name: "Apple",
        shares: 2,
        priceNative: 150,
        usdCost: 300,
        twdCost: 9600,
      }),
      makeTx({
        id: "sell-1",
        date: "2024-10-01",
        ticker: "2330",
        shares: 3,
        type: "sell",
        priceNative: 120,
        twdCost: 360,
      }),
    ];

    const prices: Record<string, StockPriceCache> = {
      "2330": {
        ticker: "2330",
        price: 130,
        currency: "TWD",
        lastUpdated: "2025-01-01T00:00:00.000Z",
      },
      AAPL: {
        ticker: "AAPL",
        price: 170,
        currency: "USD",
        lastUpdated: "2025-01-01T00:00:00.000Z",
      },
    };

    const usdTwdRate = 32;
    const currentValue = 7 * 130 + 2 * 170 * usdTwdRate;
    const { cashFlows, dates } = buildPortfolioXIRRCashFlows(transactions, currentValue);

    expect(calcPortfolioXIRR(transactions, prices, usdTwdRate)).toBeCloseTo(
      calcXIRR(cashFlows, dates),
      10
    );
  });

  it("ignores DRIP buys as additional portfolio cash outflow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

    const transactions: StockTransaction[] = [
      makeTx({
        id: "buy-1",
        date: "2024-01-01",
        shares: 10,
        twdCost: 1000,
      }),
      makeTx({
        id: "drip-1",
        date: "2024-06-01",
        shares: 1,
        twdCost: 120,
        note: applyDividendReinvestToNote("", true),
      }),
    ];

    const { cashFlows } = buildPortfolioXIRRCashFlows(transactions, 1210);
    expect(cashFlows).toEqual([-1000, 0, 1210]);
  });
});
