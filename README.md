# 記帳本 (Expense Tracker)

以 React Native + Expo + TypeScript 開發的跨平台記帳 App，支援 Android / iOS / Web，並包含多幣別與投資（股票）管理。

## 目前功能

### 一般記帳

- **新手導覽**：首次使用可完成帳戶與主要貨幣設定。
- **日常記帳**：收入、支出、轉帳，支援新增、編輯、刪除；主畫面以日曆形式瀏覽，點日期查看當日明細。
- **帳戶管理**：多帳戶、初始金額、帳本餘額、帳戶新增與編輯。
- **分類管理**：收入/支出類別自訂（含 icon）、拖曳排序、各分類可設定預設帳戶、交易分類篩選與分類統計明細。
- **計算機鍵盤**：金額輸入支援內建計算機鍵盤，可直接輸入算式。

### 預算與自動化

- **預算系統**：每月預算、年度預算（含年費攤提計算）、固定項目連動、預算連結交易、月度儲蓄目標設定。
- **自動化規則**：固定收支、信用卡自動扣款、現金自動補充、轉帳模板；交易同步支援月份固定項目 mapping。
- **台灣國定假日**：整合台灣假日資料，於預算計算中自動排除假日。
- **推播通知**：帳戶餘額過低時自動發送推播提醒。

### 多幣別

- **多幣別帳戶**：主幣別切換、匯率更新、自訂幣別管理。
- **外幣成本基礎**：預算與統計畫面支援外幣帳戶成本基礎計算，正確換算主幣別等值。

### 統計圖表

- **統計畫面**：月/年維度的總收入、總支出、結餘一覽；支出與收入各類別占比圓餅圖，可點入查看分類明細。

### 資料交換

- **記帳 CSV 匯出/匯入**：可匯出備份、匯入既有資料（自動建立缺少的分類）、下載匯入範本；匯入時顯示進度與錯誤提示。
- **股票 CSV 匯入**：支援行動端與 Web，含解析預覽、載入進度、錯誤提示與自選股自動補齊。

### 投資模組

- **股票交易**：買入、賣出、股息再投資（DRIP），支援 TWD / USD 成本分開記錄；可批次刪除同一股票的所有交易。
- **投資組合總覽**：持股清單、各標的配置比例、損益計算（含實際 USD 成本）。
- **個股明細**：逐年報酬率、年末價格抓取、歷史交易明細。
- **自選股**：自訂追蹤股票清單，可於股票匯入時自動補齊。
- **ETF 持股曝險**：分析 ETF 的實際持股成分與曝險比例；支援單一資產 ETF 特殊處理。
- **年度視圖**：投資組合年度損益回顧。
- **公司基本面分析**：透過 Alpha Vantage 取得個股/ETF 概況（市值、PE、EPS、股息率等），顯示：
  - 近 5 年 EPS 歷史長條圖
  - 近年營收長條圖（含 YoY 標示）
  - 季度財報表（EPS / 營收）
  - 歷史 PE 區間折線圖
  - 即時價格 Sparkline
- **Sparkline**：輕量化折線圖元件，用於快速呈現趨勢。
- **投資設定**：設定 Alpha Vantage API Key 以取得 ETF 持股與基本面資料；資料採 3 天快取策略。

## 技術與版本

- Expo SDK：`~54.0.0`
- React Native：`0.81.5`
- React：`19.1.0`
- 語言：TypeScript
- 測試：Vitest（`npm run test`）
- 儲存：Native 使用 Expo SQLite，Web 使用 AsyncStorage

## 專案結構

```txt
expense-tracker/
├── App.tsx
├── src/
│   ├── components/      # 共用 UI 元件（Calendar、PieChart、Sparkline、EpsHistoryChart、RevenueChart 等）
│   ├── constants/       # 全域常數
│   ├── contexts/        # 狀態管理（交易、預算、投資、分類、Onboarding）
│   ├── db/              # SQLite schema 與初始化
│   ├── hooks/           # 自訂 hooks
│   ├── navigation/      # Onboarding / Main Stack
│   ├── screens/         # 各功能畫面
│   ├── types/           # 型別定義
│   └── utils/           # 儲存、匯率、CSV、投資、統計工具
├── assets/
└── app.json
```

## Feature Flags（功能開關）

### 投資模組 `EXPO_PUBLIC_ENABLE_INVESTMENTS`

投資相關功能（底部 Tab、導航路由、設定項目）由此旗標統一控制，關閉後整個投資模組從 UI 上隱藏。

**控制點：** [`src/config/features.ts`](src/config/features.ts)

```ts
export const ENABLE_INVESTMENTS =
  process.env.EXPO_PUBLIC_ENABLE_INVESTMENTS === 'true';
```

---

#### 本機開發（`npm start`）

在專案根目錄新增 `.env` 檔（預設無此檔案，等同 `false`）：

```bash
# .env
EXPO_PUBLIC_ENABLE_INVESTMENTS=true   # 開啟
# EXPO_PUBLIC_ENABLE_INVESTMENTS=false  # 關閉（預設）
```

修改後需重啟 dev server（`npm start`）才會生效。

---

#### EAS 打包（`eas.json`）

各 build profile 分別設定，改 `"true"` / `"false"` 即可：

```json
{
  "build": {
    "preview":    { "env": { "EXPO_PUBLIC_ENABLE_INVESTMENTS": "true" } },
    "production": { "env": { "EXPO_PUBLIC_ENABLE_INVESTMENTS": "false" } }
  }
}
```

---

#### 影響範圍

| 檔案 | 影響 |
|------|------|
| `src/components/BottomBar.tsx` | 底部導航「投資」Tab 的顯示/隱藏 |
| `src/navigation/MainStack.tsx` | 投資相關路由的掛載/移除 |
| `src/screens/SettingsScreen.tsx` | 設定頁中「投資設定」項目的顯示/隱藏 |
| `App.tsx` | `InvestmentContext` Provider 的掛載/移除 |

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
- **記帳匯入**：可匯入既有 CSV（日期、分類、金額、帳戶、收支等欄位），缺少的分類會自動建立。
- **股票匯入**：支援 `日期, 股票代號, 股數, 成交價, 幣別, TWD成本, USD成本` 格式，並提供範本下載。

## 打包 APK（EAS）

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

建置完成後可在 [expo.dev](https://expo.dev) 下載 APK 安裝至手機。
