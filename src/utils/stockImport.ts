/**
 * 股票 CSV 匯入工具
 *
 * Excel 欄位對應（從分析結果推導）：
 *
 * 共用欄位：
 *   A = 日期（Excel 序列數，從 1900-01-01 起算）
 *
 * 006208（台股）：
 *   B = 買入金額（TWD）
 *   C = 當時股價（TWD）
 *   D = 股數
 *
 * NVDA（美股）：
 *   F = 當時股價（USD）
 *   G = 買入金額（TWD，台股標的換算）
 *   H = 動買參考（USD 成本）
 *   I = 股數
 *
 * QQQ（美股）：
 *   J = 當時股價（USD）
 *   K = USD 成本（動買參考）
 *   L = 股數
 *   M = 買入金額（TWD）
 *   N = 匯率（比率）
 *
 * SMH（美股）：
 *   P = 當時股價（USD）
 *   Q = USD 成本
 *   R = 股數
 *   S = 買入金額（TWD）
 *
 * GLD（美股）：
 *   T = 當時股價（USD）
 *   U = USD 成本
 *   V = 股數
 *   W = 買入金額（TWD）
 *
 * IBIT（美股）：
 *   X = 當時股價（USD）
 *   Y = USD 成本
 *   Z = 股數
 *   AA = 買入金額（TWD）
 *
 * ARKK（美股）：
 *   AV = USD 成本
 *   AW = 買入金額（TWD）
 *   AX = 當時股價（USD）
 *   AY = 股數
 *   AZ = 匯率
 *
 * 使用說明：
 *   1. 從 Excel 另存為 CSV（格式：逗號分隔）
 *   2. 在 APP 選取 CSV 檔案
 *   3. APP 自動解析並預覽，使用者確認後匯入
 */

import type { StockTransaction } from '../types';

/** 股票中文名稱對照 */
const TICKER_NAMES: Record<string, string> = {
  '006208': '富邦台灣優質高息 ETF',
  NVDA: 'NVIDIA',
  QQQ: 'Invesco QQQ ETF',
  SMH: 'VanEck Semiconductor ETF',
  GLD: 'SPDR Gold Shares ETF',
  IBIT: 'iShares Bitcoin Trust ETF',
  ARKK: 'ARK Innovation ETF',
};

/** 欄位索引（0-based，對應 Excel 欄字母）*/
const COL = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8,
  J: 9, K: 10, L: 11, M: 12, N: 13, O: 14,
  P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22,
  X: 23, Y: 24, Z: 25, AA: 26,
  // AV = 47, AW = 48, AX = 49, AY = 50, AZ = 51
  AV: 47, AW: 48, AX: 49, AY: 50, AZ: 51,
};

function parseNum(val: string | undefined): number | null {
  if (val == null || val.trim() === '') return null;
  const n = parseFloat(val.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

/**
 * 將 Excel 日期序列數轉為 YYYY-MM-DD 字串
 * Excel 從 1900-01-01 開始（序列數 1 = 1900-01-01，但 Excel 有 1900-02-29 的 bug）
 */
function excelDateToISO(serial: number): string | null {
  if (serial < 1 || serial > 99999) return null;
  // Excel bug: 視 60 為 1900-02-29（不存在），序列數 > 60 需減 1
  const adjusted = serial > 60 ? serial - 1 : serial;
  const epoch = new Date(1899, 11, 31); // 1899-12-31
  const ms = epoch.getTime() + adjusted * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateId(): string {
  return `stock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface ImportResult {
  transactions: StockTransaction[];
  skippedRows: number;
  errors: string[];
}

/**
 * 解析 CSV 字串，回傳二維陣列
 * 支援欄位中含逗號（用雙引號包覆）的格式
 */
export function parseCSV(csvText: string): string[][] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.map(line => {
    const cols: string[] = [];
    let inQuote = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  });
}

interface StockConfig {
  ticker: string;
  currency: 'TWD' | 'USD';
  colPrice: number;
  colShares: number;
  colTWD: number;
  colUSD?: number;
  colRate?: number;
}

const STOCK_CONFIGS: StockConfig[] = [
  // 006208（台股）：C=股價 TWD, D=股數, B=TWD成本
  { ticker: '006208', currency: 'TWD', colPrice: COL.C, colShares: COL.D, colTWD: COL.B },
  // NVDA：F=USD股價, I=股數, G=TWD, H=USD成本
  { ticker: 'NVDA', currency: 'USD', colPrice: COL.F, colShares: COL.I, colTWD: COL.G, colUSD: COL.H },
  // QQQ：J=USD股價, L=股數, M=TWD, K=USD成本, N=匯率
  { ticker: 'QQQ', currency: 'USD', colPrice: COL.J, colShares: COL.L, colTWD: COL.M, colUSD: COL.K, colRate: COL.N },
  // SMH：P=USD股價, R=股數, S=TWD, Q=USD成本
  { ticker: 'SMH', currency: 'USD', colPrice: COL.P, colShares: COL.R, colTWD: COL.S, colUSD: COL.Q },
  // GLD：T=USD股價, V=股數, W=TWD, U=USD成本
  { ticker: 'GLD', currency: 'USD', colPrice: COL.T, colShares: COL.V, colTWD: COL.W, colUSD: COL.U },
  // IBIT：X=USD股價, Z=股數, AA=TWD, Y=USD成本
  { ticker: 'IBIT', currency: 'USD', colPrice: COL.X, colShares: COL.Z, colTWD: COL.AA, colUSD: COL.Y },
  // ARKK：AX=USD股價, AY=股數, AW=TWD, AV=USD成本, AZ=匯率
  { ticker: 'ARKK', currency: 'USD', colPrice: COL.AX, colShares: COL.AY, colTWD: COL.AW, colUSD: COL.AV, colRate: COL.AZ },
];

/**
 * 主要匯入函數：解析 CSV 文字，回傳交易列表
 * skipRows: 略過最前面幾行（標頭 + 彙總區）；預設略過前 5 行
 */
export function importStockCSV(
  csvText: string,
  skipRows = 5
): ImportResult {
  const rows = parseCSV(csvText);
  const transactions: StockTransaction[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  const now = new Date().toISOString();

  for (let rowIdx = skipRows; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (row.length < 4) continue;

    // 欄 A：Excel 日期序列數
    const dateSerial = parseNum(row[COL.A]);
    if (dateSerial == null || dateSerial < 40000) {
      // 非日期（可能是年份彙總或空行）
      skippedRows++;
      continue;
    }

    const dateStr = excelDateToISO(Math.round(dateSerial));
    if (!dateStr) {
      errors.push(`第 ${rowIdx + 1} 行：無法解析日期 ${row[COL.A]}`);
      skippedRows++;
      continue;
    }

    let hasAny = false;

    for (const cfg of STOCK_CONFIGS) {
      const shares = parseNum(row[cfg.colShares]);
      if (shares == null || shares <= 0) continue;

      const priceNative = parseNum(row[cfg.colPrice]);
      const twdCost = parseNum(row[cfg.colTWD]);
      const usdCost = cfg.colUSD != null ? parseNum(row[cfg.colUSD]) : null;
      const exchangeRate = cfg.colRate != null ? parseNum(row[cfg.colRate]) : null;

      if (priceNative == null && twdCost == null) continue;

      const tx: StockTransaction = {
        id: generateId(),
        ticker: cfg.ticker,
        name: TICKER_NAMES[cfg.ticker] ?? cfg.ticker,
        date: dateStr,
        type: 'buy',
        shares,
        priceNative: priceNative ?? 0,
        usdCost: usdCost != null ? Math.abs(usdCost) : undefined,
        twdCost: twdCost != null ? Math.abs(twdCost) : 0,
        exchangeRate: exchangeRate != null ? Math.abs(exchangeRate) : undefined,
        createdAt: now,
      };

      transactions.push(tx);
      hasAny = true;
    }

    if (!hasAny) skippedRows++;
  }

  return { transactions, skippedRows, errors };
}
