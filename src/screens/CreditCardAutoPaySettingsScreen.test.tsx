import { describe, expect, it } from 'vitest';
import type { CreditCardAutoPayRule } from '../types';
import {
  getRuleStatusMeta,
  validateAutoPayDraft,
  type AutoPayRuleDraft,
} from './creditCardAutoPayUi';

const BASE_RULE: CreditCardAutoPayRule = {
  id: 'rule-1',
  creditCardAccountId: 'cc-1',
  payFromAccountId: 'cash-1',
  statementDay: 10,
  paymentDay: 20,
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isEnabled: true,
};

const BASE_DRAFT: AutoPayRuleDraft = {
  creditCardAccountId: 'cc-1',
  payFromAccountId: 'cash-1',
  statementDay: 5,
  paymentDay: 15,
  isEnabled: true,
};

describe('CreditCardAutoPay status badge', () => {
  it('returns 已刪除 when deletedAt exists', () => {
    const meta = getRuleStatusMeta({
      ...BASE_RULE,
      isEnabled: false,
      deletedAt: '2026-03-24T00:00:00.000Z',
      deleteReason: 'credit_card_account_deleted',
    });
    expect(meta.label).toBe('已刪除');
  });

  it('returns 啟用 or 停用 by isEnabled when not deleted', () => {
    expect(getRuleStatusMeta({ ...BASE_RULE, isEnabled: true }).label).toBe('啟用');
    expect(getRuleStatusMeta({ ...BASE_RULE, isEnabled: false }).label).toBe('停用');
  });
});

describe('validateAutoPayDraft', () => {
  it('rejects required field missing', () => {
    const result = validateAutoPayDraft({
      ...BASE_DRAFT,
      creditCardAccountId: '',
    }, []);
    expect(result.isValid).toBe(false);
  });

  it('rejects day out of range 1-28', () => {
    const result = validateAutoPayDraft({
      ...BASE_DRAFT,
      paymentDay: 29,
    }, []);
    expect(result.isValid).toBe(false);
  });

  it('rejects same source and credit card account', () => {
    const result = validateAutoPayDraft({
      ...BASE_DRAFT,
      payFromAccountId: 'cc-1',
    }, []);
    expect(result.isValid).toBe(false);
  });

  it('rejects duplicate active rule for same credit card account', () => {
    const result = validateAutoPayDraft(
      {
        ...BASE_DRAFT,
        creditCardAccountId: 'cc-duplicate',
      },
      [
        {
          ...BASE_RULE,
          id: 'existing',
          creditCardAccountId: 'cc-duplicate',
          isEnabled: true,
        },
      ],
    );
    expect(result.isValid).toBe(false);
  });

  it('allows edit same rule id', () => {
    const result = validateAutoPayDraft(
      {
        ...BASE_DRAFT,
        creditCardAccountId: 'cc-1',
      },
      [{ ...BASE_RULE, id: 'rule-self', creditCardAccountId: 'cc-1' }],
      'rule-self',
    );
    expect(result.isValid).toBe(true);
  });
});
