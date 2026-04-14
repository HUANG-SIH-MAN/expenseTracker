/**
 * 股票投資組合計算工具
 * - 加權平均成本（Weighted Average Cost）
 * - 未實現損益
 * - 已實現損益
 * - CAGR（年化複合成長率）
 * - XIRR（內部報酬率，考量各筆投入時間點，最能反映實際投資績效）
 * - 各年度報酬率
 */
import type { StockTransaction, StockPriceCache } from '../types';

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
      // 美股：用實際扣款 USD（含手續費）計算每股成本；台股：用 priceNative
      const nativeCostThisTx = tx.usdCost ?? tx.priceNative * tx.shares;
      pos.avgCostNative =
        (pos.avgCostNative * pos.shares + nativeCostThisTx) / newShares;
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
 * 各年度損益
 *
 * 計算方式（Modified Dietz 近似法）：
 *   年初市值 = 上年底持股數 × 上年底收盤價
 *   年末市值 = 該年底持股數 × 該年底收盤價（當年用現價）
 *   當年新投入 = 該年所有 buy 成本之和（sell 為負）
 *   年度損益 = 年末市值 - 年初市值 - 當年新投入
 *   報酬率   = 年度損益 / (年初市值 + 當年新投入)
 *
 * @param endOfYearPricesTWD  { 2020: 55.0, 2021: 88.0, ... } 各年底收盤價（TWD）
 *        若某年無資料（尚未抓到），則該年跳過不顯示
 * @param currentPriceTWD  今日現價（TWD），用於當年度
 */
export function calcYearlyReturns(
  transactions: StockTransaction[],
  endOfYearPricesTWD: Record<number, number>,
  currentPriceTWD: number
): YearlyReturn[] {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstYear = parseInt(sorted[0].date.slice(0, 4));
  const currentYear = new Date().getFullYear();

  const results: YearlyReturn[] = [];
  let sharesHeld = 0;
  let txIndex = 0;

  for (let year = firstYear; year <= currentYear; year++) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // 年初市值：用上一年底價格
    const prevYearPrice = year === firstYear ? 0 : (endOfYearPricesTWD[year - 1] ?? null);
    // 若上一年底價格尚未載入（null），且不是第一年，跳過（資料不完整）
    if (prevYearPrice === null && year !== firstYear) {
      // 仍要把這一年的交易過掉，保持 sharesHeld 正確
      while (txIndex < sorted.length && sorted[txIndex].date <= yearEnd) {
        const tx = sorted[txIndex];
        if (tx.date >= yearStart) {
          sharesHeld += tx.type === 'buy' ? tx.shares : -tx.shares;
          sharesHeld = Math.max(0, sharesHeld);
        }
        txIndex++;
      }
      continue;
    }

    const startValueTWD = sharesHeld * (prevYearPrice ?? 0);
    let investedThisYear = 0;

    // 處理這一年的交易
    while (txIndex < sorted.length && sorted[txIndex].date <= yearEnd) {
      const tx = sorted[txIndex];
      if (tx.date >= yearStart) {
        if (tx.type === 'buy') {
          sharesHeld += tx.shares;
          investedThisYear += tx.twdCost;
        } else {
          sharesHeld = Math.max(0, sharesHeld - tx.shares);
          investedThisYear -= tx.twdCost;
        }
      }
      txIndex++;
    }

    // 年末市值
    const endPrice = year === currentYear
      ? currentPriceTWD
      : (endOfYearPricesTWD[year] ?? null);

    // 年末價格也沒有就跳過（資料不完整），但 currentYear 一定有
    if (endPrice === null) continue;

    if (endPrice === 0 && sharesHeld === 0 && investedThisYear === 0) continue;

    const endValueTWD = sharesHeld * endPrice;

    // 年度損益 = 年末市值 - 年初市值 - 當年新投入
    const gainTWD = endValueTWD - startValueTWD - investedThisYear;
    const baseline = startValueTWD + investedThisYear;
    const returnRate = baseline > 0 ? gainTWD / baseline : 0;

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

/**
 * 整體投資組合各年度損益（跨所有股票）
 *
 * @param transactions  所有股票的交易紀錄
 * @param prices        目前價格快取（用於當年度現價）
 * @param usdTwdRate    美元匯率
 * @param fetchYearEndPrice  抓取某年底收盤價（台幣）的 async 函式
 */
export async function calcPortfolioYearlyReturns(
  transactions: StockTransaction[],
  prices: Record<string, StockPriceCache>,
  usdTwdRate: number,
  fetchYearEndPrice: (
    ticker: string,
    currency: 'TWD' | 'USD',
    year: number,
    rate: number,
  ) => Promise<number | null>,
): Promise<YearlyReturn[]> {
  if (transactions.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstYear = parseInt(sorted[0].date.slice(0, 4));
  const currentYear = new Date().getFullYear();

  // 收集所有 ticker 及其幣別
  const tickerCurrency = new Map<string, 'TWD' | 'USD'>();
  for (const tx of sorted) {
    if (!tickerCurrency.has(tx.ticker)) {
      tickerCurrency.set(tx.ticker, tx.usdCost != null ? 'USD' : 'TWD');
    }
  }

  // 預先抓完整年底價格（跳過當年）
  const endOfYearPrices: Record<string, Record<number, number>> = {}; // ticker -> year -> priceTWD
  const fetchPromises: Promise<void>[] = [];
  for (const [ticker, currency] of tickerCurrency.entries()) {
    endOfYearPrices[ticker] = {};
    for (let y = firstYear; y < currentYear; y++) {
      fetchPromises.push(
        fetchYearEndPrice(ticker, currency, y, usdTwdRate).then(price => {
          if (price != null) endOfYearPrices[ticker][y] = price;
        }),
      );
    }
  }
  await Promise.all(fetchPromises);

  // 取得某 ticker 在某年底的 TWD 價格（當年用現價快取）
  function getPriceTWDForYear(ticker: string, year: number): number | null {
    if (year === currentYear) {
      const cache = prices[ticker];
      if (!cache) return null;
      return cache.currency === 'TWD' ? cache.price : cache.price * usdTwdRate;
    }
    return endOfYearPrices[ticker]?.[year] ?? null;
  }

  // 計算每一年的總市值（所有 ticker 加總）
  function portfolioValueAtYearEnd(txsBefore: StockTransaction[], year: number): number | null {
    const positions = calculatePositions(txsBefore);
    let total = 0;
    for (const [ticker, pos] of positions.entries()) {
      if (pos.shares <= 0) continue;
      const price = getPriceTWDForYear(ticker, year);
      if (price === null) return null; // 缺少價格資料
      total += pos.shares * price;
    }
    return total;
  }

  const results: YearlyReturn[] = [];

  for (let year = firstYear; year <= currentYear; year++) {
    const yearEnd = `${year}-12-31`;
    const prevYearEnd = `${year - 1}-12-31`;

    const txsBeforeYear = sorted.filter(tx => tx.date <= prevYearEnd);
    const txsUpToYear = sorted.filter(tx => tx.date <= yearEnd);
    const txsThisYear = sorted.filter(
      tx => tx.date >= `${year}-01-01` && tx.date <= yearEnd,
    );

    const startValue = year === firstYear ? 0 : portfolioValueAtYearEnd(txsBeforeYear, year - 1);
    const endValue = portfolioValueAtYearEnd(txsUpToYear, year);

    // 若資料不完整（歷史年份缺價格）就跳過
    if (startValue === null || endValue === null) continue;

    let investedThisYear = 0;
    for (const tx of txsThisYear) {
      investedThisYear += tx.type === 'buy' ? tx.twdCost : -tx.twdCost;
    }

    // 若整年都沒持倉且沒投入，跳過
    if (endValue === 0 && startValue === 0 && investedThisYear === 0) continue;

    const gainTWD = endValue - startValue - investedThisYear;
    const baseline = startValue + investedThisYear;
    const returnRate = baseline > 0 ? gainTWD / baseline : 0;

    results.push({
      year,
      startValueTWD: startValue,
      endValueTWD: endValue,
      investedTWD: investedThisYear,
      gainTWD,
      returnRate,
    });
  }

  return results;
}
