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

## 路徑別名

`tsconfig.json` 已設定 `@/*` 對應 `src/*`，撰寫程式時可使用：

```ts
import { APP_NAME } from '@/constants';
```

若需在執行時使用路徑別名，可額外安裝 `babel-plugin-module-resolver` 並在 `babel.config.js` 設定。

## 後續規劃

- 導航（例如 React Navigation）
- 記帳列表、新增/編輯/刪除
- 分類、篩選、統計
- 本地儲存（AsyncStorage 或 SQLite）
