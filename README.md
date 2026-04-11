# 記帳本 (Expense Tracker)

以 React Native + Expo + TypeScript 開發的跨平台記帳 App，支援 Android / iOS / Web，並包含多幣別與投資（股票）管理。

## 目前功能

- **新手導覽**：首次使用可完成帳戶與主要貨幣設定。
- **日常記帳**：收入、支出、轉帳，支援新增、編輯、刪除與按日期檢視。
- **帳戶管理**：多帳戶、初始金額、帳本餘額、帳戶新增與編輯。
- **分類管理**：收入/支出類別自訂（含 icon）、交易分類篩選與分類統計。
- **預算系統**：每月預算、年度預算、固定項目連動與預算連結交易。
- **自動化規則**：固定收支、信用卡自動扣款、現金自動補充、轉帳模板。
- **多幣別**：主幣別切換、匯率更新、自訂幣別管理。
- **資料交換**：記帳 CSV 匯出、CSV 匯入、下載匯入範本。
- **投資模組**：股票交易（買/賣）、投資組合總覽、個股明細、自選股、ETF 持股曝險、年度視圖。
- **股票 CSV 匯入**：支援行動端與 Web 匯入，含解析預覽、錯誤提示與自選股自動補齊。
- **投資設定**：可設定 Alpha Vantage API Key 以更新 ETF 持股資料。

## 技術與版本

- Expo SDK：`~54.0.0`
- React Native：`0.81.5`
- React：`19.1.0`
- 語言：TypeScript
- 測試：Vitest（`npm run test`）
- 儲存：AsyncStorage（部分模組搭配 Expo SQLite）

## 專案結構

```txt
expense-tracker/
├── App.tsx
├── src/
│   ├── components/      # 共用 UI 元件
│   ├── constants/       # 全域常數
│   ├── contexts/        # 狀態管理（交易、預算、投資等）
│   ├── navigation/      # Onboarding / Main Stack
│   ├── screens/         # 各功能畫面
│   ├── types/           # 型別定義
│   └── utils/           # 儲存、匯率、CSV、投資工具
├── assets/
└── app.json
```

## 開發指令

```bash
npm install
npm start
npm run android
npm run ios
npm run web
npm run test
```

## 常見問題

### Expo 無法啟動或打包失敗

```bash
npx expo start --clear
```

若 Web 仍有套件解析錯誤，可改用：

```bash
npx expo start --web --clear
```

### Expo Go 顯示版本不相容

本專案目前使用 Expo SDK 54，請先更新手機上的 Expo Go。若商店版本尚未跟上，可先用 `npm run web` 或改用 EAS 建置 APK 測試。

## 匯入匯出說明

- **記帳匯出**：可將現有交易匯出為 CSV 備份。
- **記帳匯入**：可匯入既有 CSV（日期、分類、金額、帳戶、收支等欄位）。
- **股票匯入**：支援 `日期, 股票代號, 股數, 成交價, 幣別, TWD成本, USD成本` 格式，並提供範本下載。

## 打包 APK（EAS）

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

建置完成後可在 [expo.dev](https://expo.dev) 下載 APK 安裝至手機。
