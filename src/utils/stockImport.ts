/**
 * 股票 CSV 匯入工具
 *
 * 格式（每行一筆交易）：
 *   日期,股票代號,類型,股數,成交價,幣別,TWD成本,USD成本
 *
 * 欄位說明：
 *   日期     YYYY-MM-DD
 *   股票代號  任意代號（台股如 2330、006208；美股如 NVDA、QQQ）
 *   類型     buy（買入）/ sell（賣出）/ drip（股利再投資）；不填預設 buy
 *   股數     正數
 *   成交價   當時每股價格（幣別同「幣別」欄）
 *   幣別     TWD 或 USD（不填預設 TWD）
 *   TWD成本  選填，實際花費台幣（含手續費）；drip 可留空
 *   USD成本  選填，USD 股票的美金成本；TWD 股票不需填
 *
 * 舊格式相容：若第 2 欄為數字（股數），自動視為舊格式（無 類型 欄）
 * 匯率自動回推：若同時有 TWD成本 與 USD成本，匯率 = TWD成本 / USD成本
 */

import type { StockTransaction } from '../types';
import { STOCK_DIVIDEND_REINVEST_NOTE_TAG } from './stockDividendReinvest';

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

    // 支援 YYYY/M/D 或 YYYY/MM/DD，自動轉為 YYYY-MM-DD
    const rawDateInput = (row[0] ?? '').trim();
    const slashMatch = rawDateInput.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    const rawDate = slashMatch
      ? `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`
      : rawDateInput;
    const ticker = (row[1] ?? '').trim().toUpperCase();

    // 舊格式偵測：第 2 欄是數字 → 無 類型 欄，使用舊欄位對應
    const col2 = (row[2] ?? '').trim();
    const isLegacyFormat = col2 !== '' && parseNum(col2) !== null;

    const typeRaw = isLegacyFormat ? 'buy' : col2.toLowerCase();
    const isDrip = typeRaw === 'drip';
    const txType: 'buy' | 'sell' = typeRaw === 'sell' ? 'sell' : 'buy';
    const offset = isLegacyFormat ? 0 : 1; // 新格式欄位後移 1

    const shares = parseNum(row[2 + offset]);
    const priceNative = parseNum(row[3 + offset]);
    const currency = (row[4 + offset] ?? '').trim().toUpperCase() || 'TWD';
    const twdCostRaw = parseNum(row[5 + offset]);
    const usdCostRaw = parseNum(row[6 + offset]);

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
      errors.push(`第 ${rowIdx + 1} 行：股數無效「${row[2 + offset]}」`);
      skippedRows++;
      continue;
    }

    const isUSD = currency === 'USD';

    // TWD 成本：有填用填的；DRIP 沒填視為 0；一般買入沒填從股數×成交價估算
    const twdCost = twdCostRaw != null
      ? Math.abs(twdCostRaw)
      : (isDrip ? 0 : (priceNative != null && !isUSD ? shares * priceNative : 0));

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
      type: txType,
      shares,
      priceNative: priceNative ?? 0,
      usdCost,
      twdCost,
      exchangeRate,
      note: isDrip ? STOCK_DIVIDEND_REINVEST_NOTE_TAG : undefined,
      createdAt: now,
    };

    transactions.push(tx);
  }

  return { transactions, skippedRows, errors };
}
