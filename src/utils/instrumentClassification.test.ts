import { describe, expect, it } from 'vitest';
import { classifyInstrument } from './instrumentClassification';

describe('classifyInstrument', () => {
  it('classifies TW equity ticker', () => {
    const result = classifyInstrument({ ticker: '2330', isETF: false });
    expect(result.category).toBe('TW_EQUITY');
  });

  it('classifies TW etf ticker', () => {
    const result = classifyInstrument({ ticker: '0050', isETF: true });
    expect(result.category).toBe('TW_ETF');
  });

  it('classifies US equity ticker', () => {
    const result = classifyInstrument({ ticker: 'AAPL', isETF: false });
    expect(result.category).toBe('US_EQUITY');
  });

  it('classifies US etf ticker', () => {
    const result = classifyInstrument({ ticker: 'QQQ', isETF: true });
    expect(result.category).toBe('US_ETF');
  });

  it('falls back to US equity for unknown ticker format', () => {
    const result = classifyInstrument({ ticker: '??' });
    expect(result.category).toBe('US_EQUITY');
  });
});
