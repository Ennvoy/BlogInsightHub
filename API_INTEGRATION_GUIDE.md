# 外部 API 整合指南

本系統需要整合以下外部 API 才能實現完整的自動化功能：

## 必要 API

### 1. OpenAI API（AI 分析與評分）
**用途**: 自動閱讀文章內容並給予評分 (0-100)，分析文章品質、相關性

**Replit 整合**: ✅ 有官方整合

**如何設定**:
1. 前往 [OpenAI Platform](https://platform.openai.com/api-keys) 註冊並取得 API Key
2. 在 Replit 專案中使用官方整合（我可以幫你安裝）
3. 系統會自動管理 API Key，無需手動設定環境變數

**費用**: 
- GPT-4o: $2.50 / 1M input tokens, $10 / 1M output tokens
- GPT-3.5-turbo: $0.50 / 1M input tokens, $1.50 / 1M output tokens
- 建議使用 GPT-4o-mini: $0.15 / 1M tokens (性價比最高)

**預估用量**: 分析 100 篇文章約 $0.05-0.20

---

### 2. Google Custom Search API（搜尋引擎抓取）
**用途**: 自動搜尋 Google 並取得前 10-20 名結果

**Replit 整合**: ❌ 無官方整合（需手動設定）

**如何設定**:
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 啟用 "Custom Search API"
3. 建立 API Key
4. 建立 Custom Search Engine (CSE)：
   - 前往 [Programmable Search Engine](https://programmablesearchengine.google.com/)
   - 點擊「新增搜尋引擎」
   - 搜尋整個網路：選擇「搜尋整個網路」
   - 取得 Search Engine ID (CX)

**需要的環境變數**:
```
GOOGLE_API_KEY=你的 API Key
GOOGLE_CSE_ID=你的 Search Engine ID
```

**費用**: 
- 免費額度: 100 次查詢/天
- 付費: $5 / 1000 次查詢

**預估用量**: 每日自動抓取 20-50 個關鍵字 = 每月約 $3-8

---

## 可選 API

### 3. SimilarWeb API（流量數據）
**用途**: 取得網站流量估算、排名等數據

**Replit 整合**: ❌ 無官方整合

**替代方案**:
- 使用免費的公開工具 API (如 Mozilla Observatory)
- 或者手動使用 SEO 工具抓取 (Ahrefs, SEMrush)
- 或者僅使用 Google Search Rank 作為流量指標

**費用**: 
- 企業版 API: 需聯繫銷售 (通常 $500+/月)
- 建議: 先不使用，用搜尋排名代替

---

## 整合步驟

### 第一步：安裝 OpenAI 整合
我可以立即為你安裝 Replit 的 OpenAI 整合。

### 第二步：設定 Google Search API
1. 取得 API Key 和 Search Engine ID
2. 使用 Replit 的 Secrets 功能儲存：
   - 點擊左側 "Secrets" (鎖頭圖示)
   - 新增 `GOOGLE_API_KEY`
   - 新增 `GOOGLE_CSE_ID`

### 第三步：建立自動化腳本
我會為你建立以下功能：

#### A. 自動搜尋腳本 (`/api/crawl/google`)
```typescript
// 自動搜尋 Google 並儲存結果
POST /api/crawl/google
Body: { keywords: ["台北 美食", "台中 旅遊"] }
```

#### B. AI 分析腳本 (`/api/analyze/content`)
```typescript
// 使用 OpenAI 分析文章內容
POST /api/analyze/content
Body: { url: "https://example.com/article" }
Response: { score: 85, analysis: "高品質內容..." }
```

#### C. 批次處理腳本 (`/api/batch/analyze`)
```typescript
// 批次分析待審核的文章
POST /api/batch/analyze
Body: { limit: 50 }
```

---

## 成本估算

### 每月預算範例 (100 個新名單/天)

| API | 用量 | 成本 |
|-----|------|------|
| Google Search | ~1500 queries/月 | $7.50 |
| OpenAI GPT-4o-mini | ~3000 篇分析 | $5-10 |
| **總計** | | **$12.50-17.50/月** |

### 如何降低成本
1. **使用免費額度**: Google 每天前 100 次免費
2. **智慧快取**: 相同 URL 不重複分析
3. **分階段過濾**: 先用簡單規則過濾 80%，再用 AI 分析剩下 20%
4. **使用較小模型**: GPT-4o-mini 比 GPT-4o 便宜 94%

---

## 下一步

你想要：
1. ✅ **立即安裝 OpenAI 整合** (推薦先做這個)
2. 📝 我為你建立 Google Search 的整合代碼範例
3. 🤖 建立完整的自動化工作流程 (排程每日抓取)
4. 💡 先看看現有功能，之後再決定

請告訴我你的選擇，我會立即開始！
