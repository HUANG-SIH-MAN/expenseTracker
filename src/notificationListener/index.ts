/**
 * Phase 0：Android 通知監聽（NotificationListenerService）接線。
 * 僅 Android 生效；iOS / Web 為 no-op。
 *
 * headless task 會在「任何 App 的通知」到達時被系統喚起執行，
 * 即使本 App 在背景或被關閉。這裡先把整包通知原封存進 DB，不做解析。
 */
import { AppRegistry, Platform } from "react-native";
import RNAndroidNotificationListener, {
  RNAndroidNotificationListenerHeadlessJsName,
} from "react-native-android-notification-listener";
import { saveCapturedNotification } from "../utils/notificationCapture";

export type NotificationPermissionStatus = "authorized" | "denied" | "unknown";

interface HeadlessTaskData {
  // 套件會以字串（JSON）或物件形式帶入通知內容
  notification?: string | Record<string, unknown>;
}

async function headlessNotificationTask(taskData: HeadlessTaskData): Promise<void> {
  try {
    const raw = taskData?.notification;
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw;
    await saveCapturedNotification(parsed);
  } catch {
    // 背景任務絕不可 throw，否則會讓 headless service crash
  }
}

let registered = false;

/** 在 App 進入點呼叫一次，註冊背景 headless task。 */
export function registerNotificationListener(): void {
  if (Platform.OS !== "android" || registered) return;
  registered = true;
  AppRegistry.registerHeadlessTask(
    RNAndroidNotificationListenerHeadlessJsName,
    () => headlessNotificationTask,
  );
}

/** 查詢「通知存取權」是否已授權。 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (Platform.OS !== "android" || !RNAndroidNotificationListener) return "unknown";
  try {
    return await RNAndroidNotificationListener.getPermissionStatus();
  } catch {
    return "unknown";
  }
}

/** 導向系統「通知存取權」設定頁，讓使用者手動開啟。 */
export function requestNotificationPermission(): void {
  if (Platform.OS !== "android" || !RNAndroidNotificationListener) return;
  RNAndroidNotificationListener.requestPermission();
}
