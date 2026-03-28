import type {
  AutoPayExecutionLog,
  CreditCardAutoPayRule,
  Transaction,
} from "../types";

const MONTHS_IN_YEAR = 12;
const DAY_START_INDEX = 1;
const ZERO_AMOUNT = 0;
const RETRY_BASE_ATTEMPT = 1;
const NEXT_ATTEMPT_STEP = 1;

interface StatementPeriod {
  periodStartDateKey: string;
  periodEndDateKey: string;
}

export interface SyncCreditCardAutopayResult {
  createdCount: number;
  transactions: Transaction[];
  logs: AutoPayExecutionLog[];
}

function toDateKey(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + DAY_START_INDEX).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - DAY_START_INDEX, day);
}

function getMonthLastDay(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + DAY_START_INDEX, 0).getDate();
}

function createDateWithClampedDay(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  const lastDay = getMonthLastDay(year, monthIndex);
  const clampedDay = Math.min(day, lastDay);
  return new Date(year, monthIndex, clampedDay);
}

function addMonths(date: Date, months: number): Date {
  const nextMonthIndex = date.getMonth() + months;
  const nextYear =
    date.getFullYear() + Math.floor(nextMonthIndex / MONTHS_IN_YEAR);
  const normalizedMonthIndex =
    ((nextMonthIndex % MONTHS_IN_YEAR) + MONTHS_IN_YEAR) % MONTHS_IN_YEAR;
  return createDateWithClampedDay(nextYear, normalizedMonthIndex, date.getDate());
}

/** 若日期落在週末，依 holidayAdjust 調整至最近工作日 */
function adjustForWeekend(date: Date, holidayAdjust: CreditCardAutoPayRule['holidayAdjust']): Date {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow !== 0 && dow !== 6) return date;
  if (holidayAdjust === 'next_workday') {
    const daysToAdd = dow === 6 ? 2 : 1;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + daysToAdd);
  }
  if (holidayAdjust === 'prev_workday') {
    const daysToSub = dow === 0 ? 2 : 1;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysToSub);
  }
  return date;
}

function getScheduledPaymentDates(
  rule: CreditCardAutoPayRule,
  todayDateKey: string,
): string[] {
  const createdDateKey = toDateKey(new Date(rule.createdAt));
  const todayDate = parseDateKey(todayDateKey);
  const createdDate = parseDateKey(createdDateKey);

  let cursor = createDateWithClampedDay(
    createdDate.getFullYear(),
    createdDate.getMonth(),
    rule.paymentDay,
  );
  if (toDateKey(cursor) <= createdDateKey) {
    cursor = addMonths(cursor, DAY_START_INDEX);
  }

  const scheduledDates: string[] = [];
  while (cursor <= todayDate) {
    const adjusted = adjustForWeekend(cursor, rule.holidayAdjust ?? 'none');
    scheduledDates.push(toDateKey(adjusted));
    cursor = addMonths(cursor, DAY_START_INDEX);
  }
  return scheduledDates;
}

function getStatementPeriod(
  scheduledPaymentDateKey: string,
  rule: CreditCardAutoPayRule,
): StatementPeriod {
  const paymentDate = parseDateKey(scheduledPaymentDateKey);
  const statementMonthShift = rule.statementDay >= rule.paymentDay ? -1 : 0;
  const statementEndBase = addMonths(paymentDate, statementMonthShift);
  const statementEndDate = createDateWithClampedDay(
    statementEndBase.getFullYear(),
    statementEndBase.getMonth(),
    rule.statementDay,
  );
  const statementStartDate = addMonths(statementEndDate, -1);
  return {
    periodStartDateKey: toDateKey(statementStartDate),
    periodEndDateKey: toDateKey(statementEndDate),
  };
}

function shouldExcludeSystemAutopayTransfer(transaction: Transaction): boolean {
  return (
    transaction.type === "transfer" &&
    transaction.systemGeneratedType === "credit_card_autopay"
  );
}

function computeStatementAmount(
  transactions: Transaction[],
  rule: CreditCardAutoPayRule,
  scheduledPaymentDateKey: string,
): number {
  const period = getStatementPeriod(scheduledPaymentDateKey, rule);
  return transactions.reduce((sum, transaction) => {
    if (shouldExcludeSystemAutopayTransfer(transaction)) {
      return sum;
    }
    if (
      transaction.type !== "expense" ||
      transaction.accountId !== rule.creditCardAccountId
    ) {
      return sum;
    }
    if (
      transaction.date <= period.periodStartDateKey ||
      transaction.date > period.periodEndDateKey
    ) {
      return sum;
    }
    return sum + transaction.amount;
  }, ZERO_AMOUNT);
}

function getNextAttempt(
  logs: AutoPayExecutionLog[],
  ruleId: string,
  scheduledPaymentDate: string,
): number {
  const matched = logs.filter(
    (item) =>
      item.ruleId === ruleId && item.scheduledPaymentDate === scheduledPaymentDate,
  );
  if (matched.some((item) => item.status === "created")) {
    return 0;
  }
  const maxAttempt = matched.reduce(
    (currentMax, item) => Math.max(currentMax, item.attempt),
    ZERO_AMOUNT,
  );
  return maxAttempt + RETRY_BASE_ATTEMPT;
}

function createExecutionLog(params: {
  id: string;
  ruleId: string;
  scheduledPaymentDate: string;
  status: AutoPayExecutionLog["status"];
  attempt: number;
  createdTransactionId?: string;
  detail?: string;
  executedAt: string;
}): AutoPayExecutionLog {
  return {
    id: params.id,
    ruleId: params.ruleId,
    scheduledPaymentDate: params.scheduledPaymentDate,
    status: params.status,
    attempt: params.attempt,
    createdTransactionId: params.createdTransactionId,
    detail: params.detail,
    executedAt: params.executedAt,
  };
}

export function syncCreditCardAutopay(params: {
  rules: CreditCardAutoPayRule[];
  logs: AutoPayExecutionLog[];
  transactions: Transaction[];
  now: Date;
  generateId: () => string;
}): SyncCreditCardAutopayResult {
  const nowIso = params.now.toISOString();
  const todayDateKey = toDateKey(params.now);
  const logs = [...params.logs];
  const transactions = [...params.transactions];
  let createdCount = ZERO_AMOUNT;

  const activeRules = params.rules.filter(
    (item) => item.isEnabled && item.deletedAt == null,
  );
  for (const rule of activeRules) {
    const scheduledDates = getScheduledPaymentDates(rule, todayDateKey);
    for (const scheduledPaymentDate of scheduledDates) {
      const attempt = getNextAttempt(logs, rule.id, scheduledPaymentDate);
      if (attempt === ZERO_AMOUNT) {
        continue;
      }
      try {
        const amount = computeStatementAmount(
          transactions,
          rule,
          scheduledPaymentDate,
        );
        if (amount <= ZERO_AMOUNT) {
          logs.push(
            createExecutionLog({
              id: params.generateId(),
              ruleId: rule.id,
              scheduledPaymentDate,
              status: "skipped",
              attempt,
              detail: "statement amount is non-positive",
              executedAt: nowIso,
            }),
          );
          continue;
        }

        const createdTransactionId = params.generateId();
        const transfer: Transaction = {
          id: createdTransactionId,
          type: "transfer",
          amount,
          date: scheduledPaymentDate,
          category: "credit-card-autopay",
          accountId: rule.payFromAccountId,
          toAccountId: rule.creditCardAccountId,
          transferAmount: amount,
          isSystemGenerated: true,
          systemGeneratedType: "credit_card_autopay",
          lockedReason: "credit_card_autopay",
          createdAt: nowIso,
        };
        transactions.push(transfer);
        logs.push(
          createExecutionLog({
            id: params.generateId(),
            ruleId: rule.id,
            scheduledPaymentDate,
            status: "created",
            attempt,
            createdTransactionId,
            detail: "autopay transfer created",
            executedAt: nowIso,
          }),
        );
        createdCount += NEXT_ATTEMPT_STEP;
      } catch (error) {
        logs.push(
          createExecutionLog({
            id: params.generateId(),
            ruleId: rule.id,
            scheduledPaymentDate,
            status: "failed",
            attempt,
            detail: error instanceof Error ? error.message : "unknown error",
            executedAt: nowIso,
          }),
        );
      }
    }
  }

  return { createdCount, transactions, logs };
}

export function getStatementWindowForScheduledDate(
  scheduledPaymentDateKey: string,
  rule: Pick<CreditCardAutoPayRule, "statementDay" | "paymentDay">,
): StatementPeriod {
  return getStatementPeriod(
    scheduledPaymentDateKey,
    rule as CreditCardAutoPayRule,
  );
}
