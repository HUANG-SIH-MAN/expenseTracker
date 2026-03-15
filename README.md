# 記帳本 (Expense Tracker)

React Native + Expo 記帳本 APP，使用 TypeScript。

## 專案結構

```
expense-tracker/
├── App.tsx                 # 應用程式進入點
├── src/
│   ├── components/         # 可重用 UI 元件
│   ├── constants/          # 全域常數
│   ├── contexts/           # React Context（狀態、主題等）
│   ├── hooks/              # 自訂 Hooks
│   ├── screens/            # 畫面元件
│   │   └── HomeScreen.tsx  # 首頁
│   ├── types/              # TypeScript 型別定義
│   └── utils/              # 工具函式
├── assets/                 # 靜態資源（圖示、圖片）
└── app.json                # Expo 設定
```

## 開發

```bash
# 安裝依賴（若尚未安裝）
npm install

# 啟動開發伺服器
npm start

# 指定平台
npm run android   # Android
npm run ios       # iOS（需 macOS）
npm run web       # Web
```

## 除錯：Expo 開不起來時

若執行 `npm run web` 或 `npm start` 時出現 **Unable to resolve** 或打包失敗，可依序嘗試：

1. **清快取再啟動**（常可解決舊快取導致的解析錯誤）
   ```bash
   npx expo start --web --clear
   ```
   或只清快取：`npx expo start --clear`，再選 w 開 Web。

2. **確認依賴已安裝且版本符合 Expo**
   ```bash
   npm install
   npx expo install expo-file-system expo-sharing expo-document-picker
   ```
   `npx expo install` 會依專案 Expo 版本自動選相容的套件版本。

3. **看終端錯誤訊息**
   - `Unable to resolve "expo-xxx"`：多為套件未安裝或 Metro 快取問題，先做步驟 1、2。
   - `Unable to resolve "../components/XXX"`：多為路徑或 export 問題，確認 `src/components/index.ts` 有匯出該元件。
   - 語法錯誤（如 JSX 標籤不對應）：依檔案與行號修正。

4. **Web 專用畫面**
   - 本專案對「資料匯入與匯出」提供 `ImportExportScreen.web.tsx`，Web 建置時會用此檔，不會去解析 `expo-file-system` / `expo-sharing`，可避免 Web 打包失敗。

### 手機 Expo Go 顯示「Project is incompatible with this version of Expo Go」

本專案使用 **Expo SDK 55**，手機上的 Expo Go 必須是**支援 SDK 55 的版本**。

- **做法一**：到 **Play 商店** 搜尋「Expo Go」→ 若有「更新」請先更新，再掃 QR code。
- **做法二（Play 已是最新仍不相容）**：商店版 Expo Go 有時會晚一步支援最新 SDK，可二選一：
  - **用 Web 預覽**：電腦瀏覽器開 `http://localhost:8081`，不需 Expo Go。
  - **自己建 APK 裝在手機**：專案已設好 EAS，建出來的 APK 內含正確 SDK，不依賴 Expo Go。
    ```bash
    eas build --platform android --profile preview
    ```
    完成後下載 APK 傳到手機安裝即可（同「打包成 APK」一節）。

## 路徑別名

`tsconfig.json` 已設定 `@/*` 對應 `src/*`，撰寫程式時可使用：

```ts
import { APP_NAME } from '@/constants';
```

若需在執行時使用路徑別名，可額外安裝 `babel-plugin-module-resolver` 並在 `babel.config.js` 設定。

## 打包成 APK（安裝到手機）

本專案使用 **EAS Build** 在雲端建置 Android APK，無需在本機安裝 Android Studio。

### 前置需求

1. 安裝 EAS CLI：`npm install -g eas-cli`
2. 擁有 [Expo 帳號](https://expo.dev/signup)（免費）

### 步驟

```bash
# 1. 登入 Expo（會開啟瀏覽器）
eas login

# 2. 在專案中設定 EAS（若尚未連結）
eas build:configure

# 3. 建置 Android APK（preview 會產出 .apk，可直接安裝）
eas build --platform android --profile preview
```

建置完成後，終端會顯示下載連結，或到 [expo.dev](https://expo.dev) → 你的專案 → Builds 下載 APK，傳到手機安裝即可。

### 本機建置（進階）

若已安裝 Android SDK，可先產生原生專案再建置：

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

APK 輸出於 `android/app/build/outputs/apk/release/`。

---

## 後續規劃

- 導航（例如 React Navigation）
- 記帳列表、新增/編輯/刪除
- 分類、篩選、統計
- 本地儲存（AsyncStorage 或 SQLite）
