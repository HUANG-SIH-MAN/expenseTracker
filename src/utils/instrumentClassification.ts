import type {
  InstrumentCategory,
  InstrumentClassification,
  InstrumentMarket,
  InstrumentType,
  StockCurrency,
} from '../types';

const TW_TICKER_PATTERN = /^\d{4,6}$/;
const TW_SUFFIX_TICKER_PATTERN = /^(\d{4,6})\.(TW|TWO)$/i;

function buildCategory(market: InstrumentMarket, type: InstrumentType): InstrumentCategory {
  return `${market}_${type}` as InstrumentCategory;
}

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function isTaiwanTickerFormat(ticker: string): boolean {
  const normalized = normalizeTicker(ticker);
  return TW_TICKER_PATTERN.test(normalized) || TW_SUFFIX_TICKER_PATTERN.test(normalized);
}

export function normalizeTaiwanTicker(ticker: string): string {
  const normalized = normalizeTicker(ticker);
  const suffixMatch = normalized.match(TW_SUFFIX_TICKER_PATTERN);
  if (suffixMatch) {
    return suffixMatch[1];
  }
  return normalized;
}

function detectMarket(ticker: string, currency?: StockCurrency): InstrumentMarket {
  if (currency === 'TWD') return 'TW';
  if (currency === 'USD') return 'US';
  return isTaiwanTickerFormat(ticker) ? 'TW' : 'US';
}

interface ClassifyInstrumentInput {
  ticker: string;
  currency?: StockCurrency;
  isETF?: boolean;
}

export function classifyInstrument(input: ClassifyInstrumentInput): InstrumentClassification {
  const normalizedTicker = normalizeTicker(input.ticker);
  const market = detectMarket(normalizedTicker, input.currency);
  const type: InstrumentType = input.isETF ? 'ETF' : 'EQUITY';
  return {
    normalizedTicker,
    market,
    type,
    category: buildCategory(market, type),
  };
}
