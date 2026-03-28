import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../constants";
import type {
  AutoPayExecutionLog,
  CreditCardAutoPayRule,
  Transaction,
} from "../types";
import {
  addCreditCardAutoPayExecutionLog,
  deleteTransaction,
  getCreditCardAutoPayExecutionLogs,
  getCreditCardAutoPayRules,
  getStoredTransactions,
  saveCreditCardAutoPayExecutionLogs,
  saveCreditCardAutoPayRules,
  saveTransactions,
  softDeleteCreditCardAutoPayRule,
  syncCreditCardAutopayToTransactions,
  setOnboardingComplete,
  updateTransaction,
} from "./storage";

const mockAsyncStorageStore = new Map<string, string>();

vi.mock("../db", () => ({
  getDb: vi.fn(async () => null),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockAsyncStorageStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockAsyncStorageStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      mockAsyncStorageStore.delete(key);
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockAsyncStorageStore.delete(key);
      }
    }),
  },
}));

describe("credit card autopay contracts", () => {
  beforeEach(() => {
    mockAsyncStorageStore.clear();
  });

  it("defines exact storage key contracts for rule and execution log persistence", () => {
    expect(STORAGE_KEYS.CREDIT_CARD_AUTOPAY_RULES).toBe(
      "@expense_tracker/credit_card_autopay_rules"
    );
    expect(STORAGE_KEYS.CREDIT_CARD_AUTOPAY_EXECUTION_LOGS).toBe(
      "@expense_tracker/credit_card_autopay_execution_logs"
    );
  });

  it("enforces CreditCardAutoPayRule and AutoPayExecutionLog sample contract shapes", () => {
    const rule: CreditCardAutoPayRule = {
      id: "rule-1",
      creditCardAccountId: "account-credit",
      payFromAccountId: "account-cash",
      statementDay: 1,
      paymentDay: 10,
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isEnabled: true,
      deleteReason: "source_account_deleted",
    };

    const log: AutoPayExecutionLog = {
      id: "log-1",
      ruleId: rule.id,
      scheduledPaymentDate: "2026-04-10",
      status: "created",
      attempt: 1,
      createdTransactionId: "tx-1",
      detail: "autopay transfer created",
      executedAt: "2026-04-10T00:00:00.000Z",
    };

    expect(rule).toEqual({
      id: "rule-1",
      creditCardAccountId: "account-credit",
      payFromAccountId: "account-cash",
      statementDay: 1,
      paymentDay: 10,
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      isEnabled: true,
      deleteReason: "source_account_deleted",
    });
    expect(log).toEqual({
      id: "log-1",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-04-10",
      status: "created",
      attempt: 1,
      createdTransactionId: "tx-1",
      detail: "autopay transfer created",
      executedAt: "2026-04-10T00:00:00.000Z",
    });
  });

  it("keeps createdTransactionId/detail optional in execution log contract", () => {
    const logWithoutOptionalFields: AutoPayExecutionLog = {
      id: "log-2",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-05-10",
      status: "skipped",
      attempt: 2,
      executedAt: "2026-05-10T00:00:00.000Z",
    };

    expect(logWithoutOptionalFields).toEqual({
      id: "log-2",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-05-10",
      status: "skipped",
      attempt: 2,
      executedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(logWithoutOptionalFields.createdTransactionId).toBeUndefined();
    expect(logWithoutOptionalFields.detail).toBeUndefined();
  });

  it("enforces transaction lock metadata contract for system-generated autopay", () => {
    const transaction: Transaction = {
      id: "tx-1",
      type: "transfer",
      amount: 5000,
      date: "2026-04-10",
      category: "credit-card-autopay",
      createdAt: "2026-04-10T00:00:00.000Z",
      isSystemGenerated: true,
      systemGeneratedType: "credit_card_autopay",
      lockedReason: "credit_card_autopay",
    };

    expect(transaction.isSystemGenerated).toBe(true);
  });

  it("persists and restores autopay rules via AsyncStorage parity API", async () => {
    const rules: CreditCardAutoPayRule[] = [
      {
        id: "rule-1",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-1",
        statementDay: 2,
        paymentDay: 12,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: true,
      },
      {
        id: "rule-2",
        creditCardAccountId: "credit-2",
        payFromAccountId: "cash-2",
        statementDay: 3,
        paymentDay: 13,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: false,
        deletedAt: "2026-03-25T00:00:00.000Z",
        deleteReason: "credit_card_account_deleted",
      },
    ];

    await saveCreditCardAutoPayRules(rules);
    const restored = await getCreditCardAutoPayRules();

    expect(restored).toEqual(rules);
  });

  it("rejects duplicate active rules for the same credit card account", async () => {
    const duplicateActiveRules: CreditCardAutoPayRule[] = [
      {
        id: "rule-1",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-1",
        statementDay: 5,
        paymentDay: 15,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: true,
      },
      {
        id: "rule-2",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-2",
        statementDay: 6,
        paymentDay: 16,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: true,
      },
    ];

    await expect(saveCreditCardAutoPayRules(duplicateActiveRules)).rejects.toThrow(
      "Duplicate active credit card autopay rule for account: credit-1",
    );
  });

  it("allows same credit card account when one rule is disabled or soft-deleted", async () => {
    const rules: CreditCardAutoPayRule[] = [
      {
        id: "rule-1",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-1",
        statementDay: 7,
        paymentDay: 17,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: true,
      },
      {
        id: "rule-2",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-2",
        statementDay: 8,
        paymentDay: 18,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: false,
        deletedAt: "2026-03-25T00:00:00.000Z",
        deleteReason: "source_account_deleted",
      },
    ];

    await saveCreditCardAutoPayRules(rules);
    const restored = await getCreditCardAutoPayRules();
    expect(restored).toEqual(rules);
  });

  it("persists and restores execution logs via AsyncStorage parity API", async () => {
    const logs: AutoPayExecutionLog[] = [
      {
        id: "log-1",
        ruleId: "rule-1",
        scheduledPaymentDate: "2026-04-10",
        status: "created",
        attempt: 1,
        createdTransactionId: "tx-1",
        detail: "created transfer",
        executedAt: "2026-04-10T00:00:00.000Z",
      },
      {
        id: "log-2",
        ruleId: "rule-1",
        scheduledPaymentDate: "2026-05-10",
        status: "failed",
        attempt: 2,
        detail: "insufficient balance",
        executedAt: "2026-05-10T00:00:00.000Z",
      },
    ];

    await saveCreditCardAutoPayExecutionLogs(logs);
    const restored = await getCreditCardAutoPayExecutionLogs();
    expect(restored).toEqual(logs);
  });

  it("appends one execution log without caller-side full replace", async () => {
    const initialLogs: AutoPayExecutionLog[] = [
      {
        id: "log-1",
        ruleId: "rule-1",
        scheduledPaymentDate: "2026-04-10",
        status: "created",
        attempt: 1,
        executedAt: "2026-04-10T00:00:00.000Z",
      },
    ];
    await saveCreditCardAutoPayExecutionLogs(initialLogs);

    const appendedLog: AutoPayExecutionLog = {
      id: "log-2",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-04-10",
      status: "failed",
      attempt: 2,
      detail: "retry failed",
      executedAt: "2026-04-10T00:01:00.000Z",
    };
    await addCreditCardAutoPayExecutionLog(appendedLog);

    const restored = await getCreditCardAutoPayExecutionLogs();
    expect(restored).toEqual([...initialLogs, appendedLog]);
  });

  it("replaces duplicate execution log key on AsyncStorage append", async () => {
    const initialLog: AutoPayExecutionLog = {
      id: "log-1",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-04-10",
      status: "created",
      attempt: 1,
      detail: "first attempt",
      executedAt: "2026-04-10T00:00:00.000Z",
    };
    await saveCreditCardAutoPayExecutionLogs([initialLog]);

    const duplicateKeyLog: AutoPayExecutionLog = {
      id: "log-2",
      ruleId: "rule-1",
      scheduledPaymentDate: "2026-04-10",
      status: "failed",
      attempt: 1,
      detail: "replaced",
      executedAt: "2026-04-10T00:02:00.000Z",
    };
    await addCreditCardAutoPayExecutionLog(duplicateKeyLog);

    const restored = await getCreditCardAutoPayExecutionLogs();
    expect(restored).toEqual([duplicateKeyLog]);
  });

  it("soft-deletes rule by disabling and filling deletion metadata", async () => {
    const rules: CreditCardAutoPayRule[] = [
      {
        id: "rule-1",
        creditCardAccountId: "credit-1",
        payFromAccountId: "cash-1",
        statementDay: 9,
        paymentDay: 19,
        createdAt: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-24T00:00:00.000Z",
        isEnabled: true,
      },
    ];
    await saveCreditCardAutoPayRules(rules);
    await softDeleteCreditCardAutoPayRule("rule-1", "source_account_deleted");

    const restored = await getCreditCardAutoPayRules();
    expect(restored).toHaveLength(1);
    expect(restored[0].isEnabled).toBe(false);
    expect(restored[0].deleteReason).toBe("source_account_deleted");
    expect(restored[0].deletedAt).toBeTypeOf("string");
    expect(restored[0].deletedAt).not.toBe("");
  });

  it("persists transaction lock metadata in storage round-trip", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx-lock-1",
        type: "transfer",
        amount: 1000,
        date: "2026-04-10",
        category: "credit-card-autopay",
        createdAt: "2026-04-10T00:00:00.000Z",
        isSystemGenerated: true,
        systemGeneratedType: "credit_card_autopay",
        lockedReason: "credit_card_autopay",
      },
    ];

    await saveTransactions(transactions);
    const restored = await getStoredTransactions();
    expect(restored).toEqual(transactions);
  });

  it("rejects update for locked autopay transaction", async () => {
    const transaction: Transaction = {
      id: "tx-lock-update",
      type: "transfer",
      amount: 1000,
      date: "2026-04-10",
      category: "credit-card-autopay",
      createdAt: "2026-04-10T00:00:00.000Z",
      systemGeneratedType: "credit_card_autopay",
      lockedReason: "credit_card_autopay",
    };

    await expect(updateTransaction(transaction)).rejects.toThrow(
      "Locked autopay transaction cannot be updated",
    );
  });

  it("rejects update bypass when stored transaction is locked but incoming payload omits lock fields", async () => {
    const lockedStoredTransaction: Transaction = {
      id: "tx-lock-bypass",
      type: "transfer",
      amount: 1000,
      date: "2026-04-10",
      category: "credit-card-autopay",
      createdAt: "2026-04-10T00:00:00.000Z",
      systemGeneratedType: "credit_card_autopay",
      lockedReason: "credit_card_autopay",
    };
    await saveTransactions([lockedStoredTransaction]);

    const bypassPayload: Transaction = {
      id: "tx-lock-bypass",
      type: "expense",
      amount: 999,
      date: "2026-04-11",
      category: "food",
      createdAt: "2026-04-10T00:00:00.000Z",
    };
    await expect(updateTransaction(bypassPayload)).rejects.toThrow(
      "Locked autopay transaction cannot be updated",
    );

    const restored = await getStoredTransactions();
    expect(restored).toEqual([lockedStoredTransaction]);
  });

  it("rejects delete for locked autopay transaction", async () => {
    const lockedTransaction: Transaction = {
      id: "tx-lock-delete",
      type: "transfer",
      amount: 1000,
      date: "2026-04-10",
      category: "credit-card-autopay",
      createdAt: "2026-04-10T00:00:00.000Z",
      systemGeneratedType: "credit_card_autopay",
      lockedReason: "credit_card_autopay",
    };
    await saveTransactions([lockedTransaction]);

    await expect(deleteTransaction(lockedTransaction.id)).rejects.toThrow(
      "Locked autopay transaction cannot be deleted",
    );

    const restored = await getStoredTransactions();
    expect(restored).toEqual([lockedTransaction]);
  });
});

describe("syncCreditCardAutopayToTransactions", () => {
  const FIXED_NOW = "2026-04-20T10:00:00.000Z";
  const PAYMENT_DATE = "2026-04-10";
  const RULE_ID = "rule-sync-1";
  const CREDIT_ACCOUNT_ID = "credit-acc-1";
  const PAY_FROM_ACCOUNT_ID = "cash-acc-1";

  beforeEach(async () => {
    mockAsyncStorageStore.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));
    await setOnboardingComplete({
      accounts: [
        {
          id: CREDIT_ACCOUNT_ID,
          name: "Credit",
          initialBalance: 0,
          currency: "TWD",
        },
        {
          id: PAY_FROM_ACCOUNT_ID,
          name: "Cash",
          initialBalance: 0,
          currency: "TWD",
        },
      ],
      primaryCurrency: "TWD",
    });
  });

  it("creates transfer and created log for missing scheduled dates up to today", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);

    await saveTransactions([
      {
        id: "expense-1",
        type: "expense",
        amount: 2000,
        date: "2026-03-03",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-03-03T00:00:00.000Z",
      },
      {
        id: "expense-2",
        type: "expense",
        amount: 3000,
        date: "2026-04-01",
        category: "transport",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "autopay-old",
        type: "transfer",
        amount: 9999,
        date: "2026-04-01",
        category: "credit-card-autopay",
        accountId: PAY_FROM_ACCOUNT_ID,
        toAccountId: CREDIT_ACCOUNT_ID,
        transferAmount: 9999,
        isSystemGenerated: true,
        systemGeneratedType: "credit_card_autopay",
        lockedReason: "credit_card_autopay",
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBe(1);

    const transactions = await getStoredTransactions();
    const createdTransfer = transactions.find(
      (item) =>
        item.type === "transfer" &&
        item.systemGeneratedType === "credit_card_autopay" &&
        item.date === PAYMENT_DATE,
    );
    expect(createdTransfer).toBeDefined();
    expect(createdTransfer?.amount).toBe(5000);
    expect(createdTransfer?.accountId).toBe(PAY_FROM_ACCOUNT_ID);
    expect(createdTransfer?.toAccountId).toBe(CREDIT_ACCOUNT_ID);

    const logs = await getCreditCardAutoPayExecutionLogs();
    const createdLog = logs.find(
      (item) => item.status === "created" && item.scheduledPaymentDate === PAYMENT_DATE,
    );
    expect(createdLog).toBeDefined();
    expect(createdLog?.attempt).toBe(1);
    expect(createdLog?.createdTransactionId).toBe(createdTransfer?.id);
  });

  it("skips dates that already have created logs", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);
    await saveCreditCardAutoPayExecutionLogs([
      {
        id: "log-created-existing",
        ruleId: RULE_ID,
        scheduledPaymentDate: PAYMENT_DATE,
        status: "created",
        attempt: 1,
        createdTransactionId: "tx-created-existing",
        executedAt: "2026-04-10T00:00:00.000Z",
      },
    ]);
    await saveTransactions([
      {
        id: "expense-1",
        type: "expense",
        amount: 1200,
        date: "2026-04-01",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBe(0);

    const logs = await getCreditCardAutoPayExecutionLogs();
    expect(
      logs.filter(
        (item) =>
          item.status === "created" && item.scheduledPaymentDate === PAYMENT_DATE,
      ),
    ).toHaveLength(1);
  });

  it("retries failed or skipped executions with incremented attempt", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);
    await saveCreditCardAutoPayExecutionLogs([
      {
        id: "log-failed-1",
        ruleId: RULE_ID,
        scheduledPaymentDate: PAYMENT_DATE,
        status: "failed",
        attempt: 1,
        detail: "first failed",
        executedAt: "2026-04-10T00:00:00.000Z",
      },
    ]);
    await saveTransactions([
      {
        id: "expense-1",
        type: "expense",
        amount: 2200,
        date: "2026-04-01",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBe(1);

    const logs = await getCreditCardAutoPayExecutionLogs();
    const retryCreated = logs.find(
      (item) =>
        item.ruleId === RULE_ID &&
        item.scheduledPaymentDate === PAYMENT_DATE &&
        item.status === "created" &&
        item.attempt === 2,
    );
    expect(retryCreated).toBeDefined();
  });

  it("writes skipped log with new attempt when computed amount is non-positive", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);

    await saveTransactions([
      {
        id: "income-1",
        type: "income",
        amount: 1000,
        date: "2026-04-01",
        category: "salary",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBe(0);

    const logs = await getCreditCardAutoPayExecutionLogs();
    expect(logs.every((item) => item.status === "skipped")).toBe(true);
    const paymentDateLog = logs.find(
      (item) => item.scheduledPaymentDate === PAYMENT_DATE,
    );
    expect(paymentDateLog?.attempt).toBe(1);
  });

  it("computes statement period across month when statementDay is after paymentDay", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 25,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);
    await saveTransactions([
      {
        id: "expense-in-window",
        type: "expense",
        amount: 9000,
        date: "2026-03-25",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "expense-out-window",
        type: "expense",
        amount: 2600,
        date: "2026-03-26",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-03-26T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBeGreaterThan(0);

    const transfers = (await getStoredTransactions()).filter(
      (item) =>
        item.type === "transfer" &&
        item.systemGeneratedType === "credit_card_autopay" &&
        item.date === PAYMENT_DATE,
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0].amount).toBe(9000);
  });

  it("does not process scheduled date when createdDate equals that scheduled payment date", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        isEnabled: true,
      },
    ]);
    await saveTransactions([
      {
        id: "expense-1",
        type: "expense",
        amount: 1500,
        date: "2026-04-01",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const result = await syncCreditCardAutopayToTransactions();
    expect(result.createdCount).toBe(0);
    expect(await getCreditCardAutoPayExecutionLogs()).toEqual([]);
  });

  it("stops retry chain after created exists for the same scheduled date", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);
    await saveCreditCardAutoPayExecutionLogs([
      {
        id: "log-1",
        ruleId: RULE_ID,
        scheduledPaymentDate: PAYMENT_DATE,
        status: "failed",
        attempt: 1,
        executedAt: "2026-04-10T00:00:00.000Z",
      },
      {
        id: "log-2",
        ruleId: RULE_ID,
        scheduledPaymentDate: PAYMENT_DATE,
        status: "skipped",
        attempt: 2,
        executedAt: "2026-04-10T00:01:00.000Z",
      },
      {
        id: "log-3",
        ruleId: RULE_ID,
        scheduledPaymentDate: PAYMENT_DATE,
        status: "created",
        attempt: 3,
        createdTransactionId: "tx-created",
        executedAt: "2026-04-10T00:02:00.000Z",
      },
    ]);
    await saveTransactions([
      {
        id: "expense-1",
        type: "expense",
        amount: 1800,
        date: "2026-04-01",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const firstRun = await syncCreditCardAutopayToTransactions();
    const logsAfterFirst = await getCreditCardAutoPayExecutionLogs();
    const sameDateLogsAfterFirst = logsAfterFirst.filter(
      (item) =>
        item.ruleId === RULE_ID && item.scheduledPaymentDate === PAYMENT_DATE,
    );
    const transactionsAfterFirst = await getStoredTransactions();
    const autopayTransfersAfterFirst = transactionsAfterFirst.filter(
      (item) =>
        item.type === "transfer" &&
        item.systemGeneratedType === "credit_card_autopay" &&
        item.date === PAYMENT_DATE,
    );
    expect(firstRun.createdCount).toBe(0);
    expect(sameDateLogsAfterFirst).toHaveLength(3);
    expect(autopayTransfersAfterFirst).toHaveLength(0);

    const secondRun = await syncCreditCardAutopayToTransactions();
    const logsAfterSecond = await getCreditCardAutoPayExecutionLogs();
    const sameDateLogsAfterSecond = logsAfterSecond.filter(
      (item) =>
        item.ruleId === RULE_ID && item.scheduledPaymentDate === PAYMENT_DATE,
    );
    const transactionsAfterSecond = await getStoredTransactions();
    const autopayTransfersAfterSecond = transactionsAfterSecond.filter(
      (item) =>
        item.type === "transfer" &&
        item.systemGeneratedType === "credit_card_autopay" &&
        item.date === PAYMENT_DATE,
    );
    expect(secondRun.createdCount).toBe(0);
    expect(sameDateLogsAfterSecond).toHaveLength(3);
    expect(autopayTransfersAfterSecond).toHaveLength(0);
  });

  it("retries from skipped to created with incremented attempt after statement amount becomes positive", async () => {
    await saveCreditCardAutoPayRules([
      {
        id: RULE_ID,
        creditCardAccountId: CREDIT_ACCOUNT_ID,
        payFromAccountId: PAY_FROM_ACCOUNT_ID,
        statementDay: 1,
        paymentDay: 10,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        isEnabled: true,
      },
    ]);

    const firstRun = await syncCreditCardAutopayToTransactions();
    expect(firstRun.createdCount).toBe(0);
    const logsAfterFirst = await getCreditCardAutoPayExecutionLogs();
    const skippedLog = logsAfterFirst.find(
      (item) =>
        item.ruleId === RULE_ID &&
        item.scheduledPaymentDate === PAYMENT_DATE &&
        item.status === "skipped",
    );
    expect(skippedLog).toBeDefined();
    expect(skippedLog?.attempt).toBe(1);

    await saveTransactions([
      {
        id: "expense-qualify-1",
        type: "expense",
        amount: 3100,
        date: "2026-04-01",
        category: "food",
        accountId: CREDIT_ACCOUNT_ID,
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);

    const secondRun = await syncCreditCardAutopayToTransactions();
    expect(secondRun.createdCount).toBe(1);

    const logsAfterSecond = await getCreditCardAutoPayExecutionLogs();
    const createdRetryLog = logsAfterSecond.find(
      (item) =>
        item.ruleId === RULE_ID &&
        item.scheduledPaymentDate === PAYMENT_DATE &&
        item.status === "created" &&
        item.attempt === 2,
    );
    expect(createdRetryLog).toBeDefined();
  });
});
