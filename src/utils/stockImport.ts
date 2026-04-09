/**
 * 股票 CSV 匯入工具
 *
 * 格式（每行一筆交易）：
 *   日期,股票代號,股數,成交價,幣別,TWD成本,USD成本
 *
 * 欄位說明：
 *   日期     YYYY-MM-DD
 *   股票代號  任意代號（台股如 2330、006208；美股如 NVDA、QQQ）
 *   股數     正數
 *   成交價   當時每股價格（幣別同「幣別」欄）
 *   幣別     TWD 或 USD（不填預設 TWD）
 *   TWD成本  選填，實際花費台幣（含手續費）；不填則由 股數×成交價 估算
 *   USD成本  選填，USD 股票的美金成本；TWD 股票不需填
 *
 * 匯率自動回推：若同時有 TWD成本 與 USD成本，匯率 = TWD成本 / USD成本
 */

import type { StockTransaction } from '../types';

function parseNum(val: string | undefined): number | null {
  if (val == null || val.trim() === '') return null;
  const n = parseFloat(val.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
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

/**
 * 解析 CSV 文字，回傳交易列表
 * 第一行為標頭，自動略過
 */
export function importStockCSV(csvText: string): ImportResult {
  // 移除 BOM
  const text = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText;
  const rows = parseCSV(text);
  const transactions: StockTransaction[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  const now = new Date().toISOString();

  // 從第 1 行開始（略過標頭）
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // 空行略過
    if (row.every(c => c.trim() === '')) continue;

    const rawDate = (row[0] ?? '').trim();
    const ticker = (row[1] ?? '').trim().toUpperCase();
    const shares = parseNum(row[2]);
    const priceNative = parseNum(row[3]);
    const currency = (row[4] ?? '').trim().toUpperCase() || 'TWD';
    const twdCostRaw = parseNum(row[5]);
    const usdCostRaw = parseNum(row[6]);

    // 驗證日期
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      errors.push(`第 ${rowIdx + 1} 行：日期格式錯誤「${rawDate}」，請用 YYYY-MM-DD`);
      skippedRows++;
      continue;
    }

    // 驗證股票代號
    if (!ticker) {
      errors.push(`第 ${rowIdx + 1} 行：股票代號不可空白`);
      skippedRows++;
      continue;
    }

    // 驗證股數
    if (shares == null || shares <= 0) {
      errors.push(`第 ${rowIdx + 1} 行：股數無效「${row[2]}」`);
      skippedRows++;
      continue;
    }

    const isUSD = currency === 'USD';

    // TWD 成本：有填用填的，沒填從股數×成交價估算
    const twdCost = twdCostRaw != null
      ? Math.abs(twdCostRaw)
      : (priceNative != null && !isUSD ? shares * priceNative : 0);

    const usdCost = isUSD && usdCostRaw != null ? Math.abs(usdCostRaw) : undefined;

    // 匯率回推
    const exchangeRate =
      usdCost != null && usdCost !== 0 && twdCost !== 0
        ? twdCost / usdCost
        : undefined;

    const tx: StockTransaction = {
      id: generateId(),
      ticker,
      name: ticker,
      date: rawDate,
      type: 'buy',
      shares,
      priceNative: priceNative ?? 0,
      usdCost,
      twdCost,
      exchangeRate,
      createdAt: now,
    };

    transactions.push(tx);
  }

  return { transactions, skippedRows, errors };
}
