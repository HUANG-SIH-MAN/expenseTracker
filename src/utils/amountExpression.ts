/**
 * 金額輸入防呆：僅允許單一數字或簡單四則運算（+ - * /），
 * 不允許連續運算子（如 ++、--、**）或無效格式。
 */

const OPERATORS = ['+', '-', '*', '/'] as const;
type Operator = (typeof OPERATORS)[number];

const REGEX_VALID_CHARS = /^[\d.\s+\-*/\u00D7\u00F7]+$/; // × \u00D7, ÷ \u00F7
const REGEX_CONSECUTIVE_OPERATORS = /[+\-*/]{2,}/;
const REGEX_LEADING_OPERATOR_EXCEPT_MINUS = /^[+*/]/;
const REGEX_TRAILING_OPERATOR = /[+\-*/]\s*$/;
const REGEX_MULTIPLE_DECIMALS = /\.\d*\./;
const MAX_DECIMAL_PLACES = 2;

export interface ParseAmountResult {
  valid: boolean;
  value: number;
  error?: string;
}

/** 將顯示用運算符 × ÷ 轉成內部 * / */
function normalizeDisplayOperators(s: string): string {
  return s.replace(/\u00D7/g, '*').replace(/\u00F7/g, '/');
}

/**
 * 檢查是否為合法運算子字元（含 × ÷）
 */
function isOperatorChar(c: string): boolean {
  return OPERATORS.includes(c as Operator) || c === '\u00D7' || c === '\u00F7';
}

/**
 * 驗證輸入格式：不允許連續運算子、開頭（除負號外）或結尾為運算子、多個小數點
 */
function validateExpressionFormat(input: string): string | null {
  const trimmed = normalizeDisplayOperators(input.trim());
  if (trimmed === '' || trimmed === '-') return '請輸入金額';
  if (!REGEX_VALID_CHARS.test(input.trim())) return '僅允許數字與 + - × ÷';
  if (REGEX_CONSECUTIVE_OPERATORS.test(trimmed)) return '請勿輸入連續運算子';
  if (REGEX_LEADING_OPERATOR_EXCEPT_MINUS.test(trimmed)) return '開頭不可為 + × ÷';
  if (REGEX_TRAILING_OPERATOR.test(trimmed)) return '結尾不可為運算子';
  if (REGEX_MULTIPLE_DECIMALS.test(trimmed)) return '小數點格式錯誤';
  return null;
}

/**
 * 將輸入字串切成數字與運算子 token（不呼叫 eval，安全解析）
 * 支援開頭負數，如 -5+3
 */
function tokenize(input: string): (number | Operator)[] {
  const tokens: (number | Operator)[] = [];
  const s = normalizeDisplayOperators(input.trim());
  let i = 0;

  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    const lastToken = tokens[tokens.length - 1];
    const lastIsOperator = typeof lastToken === 'string';
    if (c === '-' && (tokens.length === 0 || lastIsOperator)) {
      let numStr = '-';
      i++;
      while (i < s.length && /[\d.]/.test(s[i])) {
        numStr += s[i];
        i++;
      }
      const n = parseFloat(numStr);
      if (Number.isNaN(n)) return [];
      tokens.push(n);
      continue;
    }
    if (isOperatorChar(c)) {
      tokens.push(c as Operator);
      i++;
      continue;
    }
    if (/\d|\./.test(c)) {
      let numStr = '';
      while (i < s.length && /[\d.]/.test(s[i])) {
        numStr += s[i];
        i++;
      }
      const n = parseFloat(numStr);
      if (Number.isNaN(n)) return [];
      tokens.push(n);
      continue;
    }
    i++;
  }
  return tokens;
}

/**
 * 安全計算：先處理 * /，再處理 + -
 */
function evaluateTokens(tokens: (number | Operator)[]): number | null {
  if (tokens.length === 0) return null;
  const first = tokens[0];
  if (typeof first !== 'number') return null;

  const mulDiv: number[] = [first];
  const mulDivOps: Operator[] = [];
  let i = 1;

  while (i < tokens.length) {
    const op = tokens[i] as Operator;
    const next = tokens[i + 1];
    if (!isOperatorChar(op as string) || typeof next !== 'number') return null;
    if (op === '*' || op === '/') {
      const prev = mulDiv[mulDiv.length - 1];
      if (op === '*') mulDiv[mulDiv.length - 1] = prev * next;
      else mulDiv[mulDiv.length - 1] = next === 0 ? 0 : prev / next;
      i += 2;
    } else {
      mulDiv.push(next);
      mulDivOps.push(op);
      i += 2;
    }
  }

  let result = mulDiv[0];
  for (let j = 0; j < mulDivOps.length; j++) {
    if (mulDivOps[j] === '+') result += mulDiv[j + 1];
    else result -= mulDiv[j + 1];
  }
  return result;
}

/**
 * 將運算結果四捨五入至指定小數位數
 */
function roundToDecimal(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * 解析金額輸入：可為單一數字或合法四則運算式（如 10+20、3*5）。
 * 不允許連續運算子（如 1++4）、結尾為運算子等無效格式。
 */
export function parseAmountInput(input: string): ParseAmountResult {
  const trimmed = normalizeDisplayOperators(input.trim());
  if (trimmed === '') {
    return { valid: false, value: 0, error: '請輸入金額' };
  }

  const formatError = validateExpressionFormat(trimmed);
  if (formatError) {
    return { valid: false, value: 0, error: formatError };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { valid: false, value: 0, error: '無法解析金額' };
  }

  if (tokens.length === 1 && typeof tokens[0] === 'number') {
    const value = roundToDecimal(tokens[0], MAX_DECIMAL_PLACES);
    return { valid: true, value };
  }

  const value = evaluateTokens(tokens);
  if (value === null || !Number.isFinite(value)) {
    return { valid: false, value: 0, error: '運算式無效' };
  }

  const rounded = roundToDecimal(value, MAX_DECIMAL_PLACES);
  return { valid: true, value: rounded };
}

/**
 * 過濾金額輸入：僅允許數字、一個小數點、一個開頭負號、以及單一運算子 + - * /
 * 連續輸入兩個運算子時，以最後輸入的運算子為準（替換前一個）。
 */
export function sanitizeAmountInput(next: string, prev: string): string {
  const raw = next.trim();
  if (raw === '') return '';
  const trimmed = normalizeDisplayOperators(raw);

  let out = '';
  let lastWasOperator = false;
  let decimalUsed = false;
  let i = 0;
  const len = trimmed.length;

  while (i < len) {
    const c = trimmed[i];
    if (c === ' ') {
      i++;
      continue;
    }
    if (isOperatorChar(c)) {
      if (lastWasOperator) {
        out = out.slice(0, -1);
      }
      if (out === '' && c !== '-') {
        i++;
        continue;
      }
      out += c;
      lastWasOperator = true;
      decimalUsed = false;
      i++;
      continue;
    }
    if (/\d/.test(c)) {
      out += c;
      lastWasOperator = false;
      i++;
      continue;
    }
    if (c === '.') {
      if (decimalUsed && lastWasOperator === false) {
        i++;
        continue;
      }
      if (lastWasOperator) decimalUsed = false;
      out += c;
      if (!lastWasOperator) decimalUsed = true;
      lastWasOperator = false;
      i++;
      continue;
    }
    i++;
  }

  return out;
}
