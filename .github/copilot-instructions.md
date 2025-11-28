# Copilot 指引 — Blog Insight Hub

以下為針對此專案（Blog Insight Hub）提供給 AI 編碼助理的簡潔指引，重點放在專案架構、開發流程、專案慣例與常見整合點。請在修改程式碼前閱讀並遵守。

1) 大致架構 (Big picture)
- **前端 (client)**: Vite + React（`client/src`），路由使用 `wouter`，React Query 放在 `client/src/lib/queryClient.ts`；UI 元件集中在 `client/src/components`。
- **後端 (server)**: Express + TypeScript（`server/index.ts` 為主進入點），路由集中在 `server/routes.ts`，排程邏輯在 `server/scheduler.ts`。
- **資料層 (shared + storage)**: DB schema 與 Zod 驗證都在 `shared/schema.ts`（使用 `drizzle-orm` + `drizzle-zod`）；實作的資料存取介面在 `server/storage.ts`（讀/寫排程、leads、configs 等）。

2) 關鍵檔案與模式 (Where to look)
- `server/index.ts`: 啟動伺服器、註冊排程引擎 `initializeScheduler()`、提供簡單的 Gemini / SerpAPI 範例。
- `server/routes.ts`: Express API 的主要路由註冊位置。新增 API 時在此加入並使用 `storage` + `zod` schema。
- `server/scheduler.ts`: 排程轉 cron 與註冊/取消／執行任務的程式碼，注意 `toCronExpression()` 與 `executeSearch()` 的實作細節。
- `shared/schema.ts`: DB table schema + `createInsertSchema` 產生的 Zod schema；在新增資料物件或 API 驗證時應以此為準。
- `client/src/*`: 含頁面（`pages/`）、共用 UI 元件（`components/`）與 React Query provider。

3) 常用開發命令（在 Windows PowerShell）
- 開發：同時啟動前後端（前端 5000、後端 5001）
  - `npm run dev:client`  # 啟動 Vite 前端
  - `npm run dev` 或 `npm run dev:server`  # 後端（`dev` 會以 tsx 執行 `server/index.ts`）
- 建置：`npm run build`（會執行 `script/build.ts`）
- 型別檢查：`npm run check`（呼叫 `tsc`）
- DB schema 推送：`npm run db:push`（使用 `drizzle-kit`）

4) 環境變數 / 外部整合
- `GEMINI_API_KEY`：Google Generative Language（Gemini）用於產生長尾關鍵字（`server/index.ts`）。
- `SERP_API_KEY`：SerpAPI，用於實作測試搜尋（`/api/search/test`）。
- `API_BASE_URL`：排程（`scheduler.ts`）呼叫 `POST /api/search` 時的 base URL，預設為 `http://127.0.0.1:5001`。

5) 專案慣例與重要實作細節
- 驗證：使用 `shared/schema.ts` 中由 `drizzle-zod` 產生的 `insert*Schema` 來驗證 API request payload（`routes.ts` 範例）。
- 新增排程：呼叫 `POST /api/schedules` 會建立 schedule 並在後端呼叫 `registerSchedule(schedule)` 以立即註冊 cron 任務。
- 排程到 cron 的映射：`scheduler.ts` 的 `toCronExpression(schedule)` 負責把 `frequency/hour/minute/dayOfWeek/dayOfMonth` 轉為 cron 表達式，請在修改排程相關欄位時一併更新此函式。
- HTML 圖片判斷：`server/index.ts` 使用 `axios` + `cheerio` 計算 `<img>` 數量以判定是否符合 `requireImages` 規則。
- API 回呼：後端內部會由排程直接呼叫自己的 `/api/search`（注意超時與錯誤處理），請確保 `API_BASE_URL` 與 server 埠號一致以避免跨域或本機連線問題。

6) 新增功能或修改時的建議步驟
- 若要新增 DB 欄位：
  - 修改 `shared/schema.ts` 的 table 定義。
  - 更新 Zod schema（若需）並執行 `npm run db:push`（`drizzle-kit`）。
  - 修改 `server/storage.ts` 的對應讀寫方法。
  - 在 `server/routes.ts` 新增或更新 API，使用相同的 Zod 驗證。
- 若要新增 API 路由：在 `server/routes.ts` 新增 route 並在需要時更新 `server/index.ts`（若需其他中介層或初始化）。

7) 常見陷阱與注意事項
- 匯入別名：前端程式使用 `@/...` 或 `@/components/...` 的路徑別名，請勿直接用相對路徑替代，若調整需要同步修改 `tsconfig.json` / Vite alias。
- 時區與排程：`scheduler.ts` 以伺服器時區計算 cron 表達式與下一次執行，跨時區部署時需確認時間一致性。
- 測試搜尋（SerpAPI）容易受外部 API 限制與 network timeout 影響，呼叫時請留意 `axios` 的 timeout 參數與錯誤訊息。

8) 例子（快速上手）
- 在 PowerShell 同時啟動前後端：
  - `npm run dev:client`（在一個 terminal）
  - `npm run dev`（在另一個 terminal）
- 使用本機測試 SerpAPI 搜尋：呼叫 `POST http://127.0.0.1:5001/api/search/test`，body 可參考 `routes.ts` 解構的 `config` 欄位。

9) 如果你是 AI 編碼助理，請遵守：
- 優先讀取並使用 `shared/schema.ts` 的型別與驗證規則。
- 在變更資料模型或 API 時，明確回報需同步修改的檔案（schema → storage → routes → frontend）。
- 若可能，提供小型、可執行的變更片段與對應的測試步驟（例如 curl 或 fetch 範例）。

---
如果你需要我將這份檔案微調（縮短、加入更多實例、或合併現有內部文件），請告訴我要補充或修正的重點。
