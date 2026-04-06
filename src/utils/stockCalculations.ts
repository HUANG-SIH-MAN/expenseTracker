/**
 * 股票投資組合計算工具
 * - 加權平均成本（Weighted Average Cost）
 * - 未實現損益
 * - 已實現損益
 * - CAGR（年化複合成長率）
 * - XIRR（內部報酬率，考量各筆投入時間點，最能反映實際投資績效）
 * - 各年度報酬率
 */
import type { StockTransaction } from '../types';

export interface HoldingPosition {
  ticker: string;
  name: string;
  shares: number;
  avgCostNative: number; // 加權平均成本（原幣）
  avgCostTWD: number;    // 加權平均成本（台幣）
  totalCostTWD: number;  // 總投入台幣成本
  totalCostUSD?: number; // 總投入 USD 成本（美股才有）
  realizedGainTWD: number; // 已實現損益（台幣）
  currency: 'TWD' | 'USD';
}

export interface YearlyReturn {
  year: number;
  startValueTWD: number;
  endValueTWD: number;
  investedTWD: number; // 當年新投入
  gainTWD: number;
  returnRate: number; // 0.1 = 10%
}

/**
 * 從交易紀錄計算每支股票的持倉狀態（加權平均成本法）
 */
export function calculatePositions(
  transactions: StockTransaction[]
): Map<string, HoldingPosition> {
  const positions = new Map<string, HoldingPosition>();

  // 按日期排序
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    let pos = positions.get(tx.ticker);
    if (!pos) {
      pos = {
        ticker: tx.ticker,
        name: tx.name,
        shares: 0,
        avgCostNative: 0,
        avgCostTWD: 0,
        totalCostTWD: 0,
        totalCostUSD: tx.usdCost != null ? 0 : undefined,
        realizedGainTWD: 0,
        currency: tx.usdCost != null ? 'USD' : 'TWD',
      };
      positions.set(tx.ticker, pos);
    }

    if (tx.type === 'buy') {
      // 加權平均成本
      const newShares = pos.shares + tx.shares;
      pos.avgCostNative =
        (pos.avgCostNative * pos.shares + tx.priceNative * tx.shares) / newShares;
      pos.avgCostTWD =
        (pos.avgCostTWD * pos.shares + (tx.twdCost / tx.shares) * tx.shares) / newShares;
      pos.shares = newShares;
      pos.totalCostTWD += tx.twdCost;
      if (pos.totalCostUSD != null && tx.usdCost != null) {
        pos.totalCostUSD += tx.usdCost;
      }
    } else if (tx.type === 'sell') {
      // 賣出：用加權平均成本計算已實現損益
      const costTWD = pos.avgCostTWD * tx.shares;
      const proceedsTWD = tx.twdCost; // 賣出收到的台幣
      pos.realizedGainTWD += proceedsTWD - costTWD;
      pos.shares = Math.max(0, pos.shares - tx.shares);
      pos.totalCostTWD = Math.max(0, pos.totalCostTWD - costTWD);
      if (pos.totalCostUSD != null && tx.usdCost != null) {
        const costUSD = (pos.totalCostUSD / (pos.shares + tx.shares)) * tx.shares;
        pos.totalCostUSD = Math.max(0, pos.totalCostUSD - costUSD);
      }
    }
  }

  return positions;
}

/**
 * 計算未實現損益
 */
export function calcUnrealizedGain(
  position: HoldingPosition,
  currentPriceTWD: number
): { gainTWD: number; gainPct: number } {
  const currentValueTWD = position.shares * currentPriceTWD;
  const gainTWD = currentValueTWD - position.totalCostTWD;
  const gainPct = position.totalCostTWD > 0 ? gainTWD / position.totalCostTWD : 0;
  return { gainTWD, gainPct };
}

/**
 * CAGR（年化複合成長率）
 * beginValue: 初始投入
 * endValue: 終值
 * years: 持有年數
 */
export function calcCAGR(
  beginValue: number,
  endValue: number,
  years: number
): number {
  if (beginValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / beginValue, 1 / years) - 1;
}

/**
 * XIRR（不規則現金流內部報酬率）
 * cashFlows: 每筆現金流（買入為負，賣出或當前市值為正）
 * dates: 對應日期（Date 物件）
 * 回傳年化報酬率（0.1 = 10%）
 *
 * 使用牛頓法迭代求解
 */
export function calcXIRR(
  cashFlows: number[],
  dates: Date[],
  guess = 0.1,
  maxIter = 200,
  tolerance = 1e-7
): number {
  if (cashFlows.length !== dates.length || cashFlows.length < 2) return 0;

  const t0 = dates[0].getTime();
  // 年數（以 365 天為基準）
  const years = dates.map(d => (d.getTime() - t0) / (365 * 24 * 60 * 60 * 1000));

  function npv(rate: number): number {
    return cashFlows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, years[i]), 0);
  }

  function npvDerivative(rate: number): number {
    return cashFlows.reduce(
      (sum, cf, i) =>
        years[i] === 0
          ? sum
          : sum - (years[i] * cf) / Math.pow(1 + rate, years[i] + 1),
      0
    );
  }

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const n = npv(rate);
    const d = npvDerivative(rate);
    if (Math.abs(d) < 1e-12) break;
    const newRate = rate - n / d;
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }
    rate = newRate;
    // 防止發散
    if (rate < -0.999) rate = -0.999;
  }
  return rate;
}

/**
 * 從交易紀錄建立 XIRR 現金流（買入為負，加上當前市值為最後一筆正現金流）
 */
export function buildXIRRCashFlows(
  transactions: StockTransaction[],
  currentTWDValue: number
): { cashFlows: number[]; dates: Date[] } {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const cashFlows: number[] = [];
  const dates: Date[] = [];

  for (const tx of sorted) {
    cashFlows.push(tx.type === 'buy' ? -tx.twdCost : tx.twdCost);
    dates.push(new Date(tx.date));
  }

  // 最後一筆：當前市值（正值）
  cashFlows.push(currentTWDValue);
  dates.push(new Date());

  return { cashFlows, dates };
}

/**
 * 各年度報酬率（對應 Excel 的 AP/AQ/AR/AS 欄）
 * 計算每一年底的累積市值，與年初比較算出當年度報酬率
 *
 * transactions: 該標的所有買賣紀錄
 * pricesByDate: { 'YYYY-MM-DD': price in TWD } — 年底收盤價
 */
export function calcYearlyReturns(
  transactions: StockTransaction[],
  endOfYearPricesTWD: Record<number, number>, // { 2021: 171.6, 2022: 155.2, ... }
  currentPriceTWD: number
): YearlyReturn[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstYear = parseInt(sorted[0].date.slice(0, 4));
  const currentYear = new Date().getFullYear();

  const results: YearlyReturn[] = [];
  let sharesHeld = 0;
  let cumulativeCostTWD = 0;
  let txIndex = 0;

  for (let year = firstYear; year <= currentYear; year++) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const sharesAtStart = sharesHeld;
    const prevYearPrice = endOfYearPricesTWD[year - 1] ?? 0;
    const startValueTWD = sharesAtStart * prevYearPrice;

    let investedThisYear = 0;

    // 處理這一年的交易
    while (txIndex < sorted.length && sorted[txIndex].date <= yearEnd) {
      const tx = sorted[txIndex];
      if (tx.date >= yearStart) {
        if (tx.type === 'buy') {
          sharesHeld += tx.shares;
          investedThisYear += tx.twdCost;
          cumulativeCostTWD += tx.twdCost;
        } else {
          sharesHeld = Math.max(0, sharesHeld - tx.shares);
          investedThisYear -= tx.twdCost;
          cumulativeCostTWD = Math.max(0, cumulativeCostTWD - tx.twdCost);
        }
      }
      txIndex++;
    }

    const endPrice =
      year === currentYear ? currentPriceTWD : (endOfYearPricesTWD[year] ?? 0);
    const endValueTWD = sharesHeld * endPrice;

    if (endValueTWD === 0 && sharesAtStart === 0 && investedThisYear === 0) continue;

    const baseline = startValueTWD + investedThisYear;
    const gainTWD = endValueTWD - cumulativeCostTWD;
    const returnRate = baseline > 0 ? (endValueTWD - baseline) / baseline : 0;

    results.push({
      year,
      startValueTWD,
      endValueTWD,
      investedTWD: investedThisYear,
      gainTWD,
      returnRate,
    });
  }

  return results;
}
