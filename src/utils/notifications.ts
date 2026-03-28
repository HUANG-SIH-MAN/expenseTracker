/**
 * 推播通知工具：
 * 1. 帳戶低餘額警示
 * 2. 信用卡自動繳款扣款日預警
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Account, CreditCardAutoPayRule, Transaction } from '../types';
import { getStatementWindowForScheduledDate } from './creditCardAutopay';

const AUTOPAY_WARNING_DAYS_BEFORE = 3;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 請求推播通知權限（iOS 需要；Android 13+ 也需要） */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** 立即發送本地通知 */
async function sendNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // 立即發送
  });
}

/** 排程通知（指定觸發時間） */
async function scheduleNotification(
  id: string,
  title: string,
  body: string,
  triggerDate: Date,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
}

/** 取消特定排程通知 */
export async function cancelScheduledNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/** 取消所有排程通知 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 計算帳戶目前餘額（initialBalance + 交易淨額）
 */
function computeAccountBalance(
  account: Account,
  transactions: Transaction[],
): number {
  let net = 0;
  for (const t of transactions) {
    if (t.type === 'transfer') {
      if (t.accountId === account.id) net -= t.amount;
      if (t.toAccountId === account.id) net += t.transferAmount ?? 0;
      continue;
    }
    if (t.accountId !== account.id) continue;
    if (t.type === 'income') net += t.amount;
    else net -= t.amount;
  }
  return account.initialBalance + net;
}

/**
 * 檢查所有帳戶餘額，若低於門檻則立即發送通知。
 * 在每次 refreshTransactions 完成後呼叫。
 */
export async function checkLowBalanceNotifications(
  accounts: Account[],
  transactions: Transaction[],
): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  for (const account of accounts) {
    if (account.isDeleted) continue;
    if (account.lowBalanceThreshold == null) continue;

    const balance = computeAccountBalance(account, transactions);
    if (balance <= account.lowBalanceThreshold) {
      await sendNotification(
        `⚠️ ${account.name} 餘額偏低`,
        `目前餘額 ${balance.toLocaleString()} ${account.currency}，已低於警示門檻 ${account.lowBalanceThreshold.toLocaleString()} ${account.currency}，請記得補錢！`,
      );
    }
  }
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNextPaymentDate(rule: CreditCardAutoPayRule): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 從今天所在月份開始往後找下一個付款日
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const year = today.getFullYear();
    const monthIdx = today.getMonth() + monthOffset;
    const normalYear = year + Math.floor(monthIdx / 12);
    const normalMonth = ((monthIdx % 12) + 12) % 12;
    const lastDay = new Date(normalYear, normalMonth + 1, 0).getDate();
    const day = Math.min(rule.paymentDay, lastDay);
    const candidate = new Date(normalYear, normalMonth, day);

    // 假日調整
    const dow = candidate.getDay();
    if (dow === 6 || dow === 0) {
      if (rule.holidayAdjust === 'next_workday') {
        candidate.setDate(candidate.getDate() + (dow === 6 ? 2 : 1));
      } else if (rule.holidayAdjust === 'prev_workday') {
        candidate.setDate(candidate.getDate() - (dow === 0 ? 2 : 1));
      }
    }

    if (candidate >= today) return candidate;
  }
  return null;
}

/**
 * 重新排程所有信用卡自動繳款預警通知。
 * 在 APP 啟動、規則變更時呼叫。
 */
export async function rescheduleAutopayWarningNotifications(
  rules: CreditCardAutoPayRule[],
  accounts: Account[],
  transactions: Transaction[],
): Promise<void> {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const activeRules = rules.filter((r) => r.isEnabled && r.deletedAt == null);

  for (const rule of activeRules) {
    const notifId = `autopay_warning_${rule.id}`;
    await cancelScheduledNotification(notifId);

    const nextPayDate = getNextPaymentDate(rule);
    if (!nextPayDate) continue;

    const warningDate = new Date(nextPayDate);
    warningDate.setDate(warningDate.getDate() - AUTOPAY_WARNING_DAYS_BEFORE);
    warningDate.setHours(9, 0, 0, 0); // 早上 9 點提醒

    const now = new Date();
    if (warningDate <= now) continue; // 已過了提醒時間，跳過

    const creditCard = accountMap.get(rule.creditCardAccountId);
    const payFrom = accountMap.get(rule.payFromAccountId);
    if (!creditCard || !payFrom) continue;

    const payFromBalance = computeAccountBalance(payFrom, transactions);
    const payDateStr = toDateKey(nextPayDate);

    // 計算本期帳單預估扣款金額
    const { periodStartDateKey, periodEndDateKey } = getStatementWindowForScheduledDate(
      payDateStr,
      rule,
    );
    const estimatedAmount = transactions.reduce((sum, t) => {
      if (t.type !== 'expense') return sum;
      if (t.accountId !== rule.creditCardAccountId) return sum;
      if (t.date <= periodStartDateKey || t.date > periodEndDateKey) return sum;
      return sum + t.amount;
    }, 0);

    let title: string;
    let body: string;

    if (estimatedAmount > 0 && payFromBalance < estimatedAmount) {
      // 餘額不足以支付扣款金額
      title = `🚨 ${creditCard.name} 扣款餘額不足！`;
      body = `預計扣款 ${estimatedAmount.toLocaleString()} ${payFrom.currency}，但 ${payFrom.name} 僅剩 ${payFromBalance.toLocaleString()} ${payFrom.currency}（差 ${(estimatedAmount - payFromBalance).toLocaleString()}），請在 ${payDateStr} 前補錢！`;
    } else if (estimatedAmount > 0) {
      // 餘額足夠，一般提醒
      title = `💳 ${creditCard.name} 即將在 ${payDateStr} 自動扣款`;
      body = `預計扣款 ${estimatedAmount.toLocaleString()} ${payFrom.currency}，${payFrom.name} 目前餘額 ${payFromBalance.toLocaleString()} ${payFrom.currency}，餘額充足。`;
    } else {
      // 本期無消費，不需通知
      continue;
    }

    await scheduleNotification(
      notifId,
      title,
      body,
      warningDate,
    );
  }
}
