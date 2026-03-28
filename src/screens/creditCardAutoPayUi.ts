import type { CreditCardAutoPayRule, HolidayAdjust } from '../types';

export const AUTO_PAY_MIN_DAY = 1;
export const AUTO_PAY_MAX_DAY = 28;

export interface AutoPayRuleDraft {
  creditCardAccountId: string;
  payFromAccountId: string;
  statementDay: number;
  paymentDay: number;
  holidayAdjust: HolidayAdjust;
  isEnabled: boolean;
}

export const HOLIDAY_ADJUST_OPTIONS: { value: HolidayAdjust; label: string; description: string }[] = [
  { value: 'none', label: '不調整', description: '依原訂日期，不管是否為假日' },
  { value: 'next_workday', label: '延後到下一個工作日', description: '遇週末順延至下週一' },
  { value: 'prev_workday', label: '提前到前一個工作日', description: '遇週末提前至上週五' },
];

interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export function parseAutoPayDayInput(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return AUTO_PAY_MIN_DAY;
  return Math.max(AUTO_PAY_MIN_DAY, Math.min(AUTO_PAY_MAX_DAY, Math.trunc(parsed)));
}

export function validateAutoPayDraft(
  draft: AutoPayRuleDraft,
  rules: CreditCardAutoPayRule[],
  editingRuleId?: string,
): ValidationResult {
  if (!draft.creditCardAccountId || !draft.payFromAccountId) {
    return { isValid: false, message: '請選擇信用卡帳戶與扣款來源帳戶' };
  }
  if (draft.creditCardAccountId === draft.payFromAccountId) {
    return { isValid: false, message: '扣款來源帳戶不可與信用卡帳戶相同' };
  }
  if (
    draft.statementDay < AUTO_PAY_MIN_DAY ||
    draft.statementDay > AUTO_PAY_MAX_DAY ||
    draft.paymentDay < AUTO_PAY_MIN_DAY ||
    draft.paymentDay > AUTO_PAY_MAX_DAY
  ) {
    return { isValid: false, message: '結帳日與扣款日需介於 1 到 28' };
  }
  if (draft.isEnabled) {
    const conflict = rules.find(
      (item) =>
        item.id !== editingRuleId &&
        item.deletedAt == null &&
        item.isEnabled &&
        item.creditCardAccountId === draft.creditCardAccountId,
    );
    if (conflict != null) {
      return { isValid: false, message: '同一信用卡帳戶僅能有一條啟用中的規則' };
    }
  }
  return { isValid: true };
}

export function getRuleStatusMeta(rule: CreditCardAutoPayRule): {
  label: '啟用' | '停用' | '已刪除';
  backgroundColor: string;
  textColor: string;
} {
  if (rule.deletedAt != null) {
    return {
      label: '已刪除',
      backgroundColor: '#f3f4f6',
      textColor: '#6b7280',
    };
  }
  if (rule.isEnabled) {
    return {
      label: '啟用',
      backgroundColor: '#dcfce7',
      textColor: '#166534',
    };
  }
  return {
    label: '停用',
    backgroundColor: '#fee2e2',
    textColor: '#991b1b',
  };
}
