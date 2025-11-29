// server.js / server/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
// 忽略 cheerio 套件內部的型別檢查錯誤（編輯器在 node_modules 中顯示隱含 any 的錯誤）
// @ts-ignore
import * as cheerio from "cheerio"; // ✅ 用來解析 HTML 數圖片
import { createServer } from "http";
import path from "path";             // ✅ 新增：提供前端靜態檔案
import { initializeScheduler } from "./scheduler"; // ✅ 導入排程引擎
import { registerRoutes } from "./routes";         // ✅ 導入路由
import { storage } from "./storage";               // ✅ 資料存取（drizzle）

const app = express();

// 未捕捉的例外與 rejection 記錄，協助診斷為何進程會在啟動後退出
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err && (err as any).stack ? (err as any).stack : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// === 健康檢查：之後用這個路徑測後端狀態 ===
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 原本的其他 app.use(...)、app.post(...) 等程式碼放在這下面
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Google AI Studio 取得
const SERP_API_KEY = process.env.SERP_API_KEY;     // SerpAPI Dashboard 取得

// ==============================
// 工具：錯誤訊息整理
// ==============================
function getErrorDetail(err: unknown): string {
  try {
    if (!err) return String(err);
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message;
    // try to read axios response data
    const anyErr = err as any;
    if (anyErr?.response?.data) return JSON.stringify(anyErr.response.data);
    return JSON.stringify(anyErr);
  } catch (e) {
    return String(err);
  }
}

// ==============================
// 工具：抓 HTML、計算 <img> 數量
// ==============================
async function hasEnoughImages(url: string, min = 3): Promise<boolean> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(html);
    const imgCount = $("img").length;
    return imgCount >= min;
  } catch (err: unknown) {
    console.error("抓圖片失敗:", url, getErrorDetail(err));
    return false;
  }
}

// ==============
// 工具：從 HTML 抓 Email
// ==============
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g;

function extractFirstEmailFromHtml(html: string | null): string | null {
  if (!html) return null;
  const matches = html.match(EMAIL_REGEX);
  if (!matches || matches.length === 0) return null;
  return matches[0];
}

async function fetchEmailFromPage(url: string): Promise<string | null> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return extractFirstEmailFromHtml(html);
  } catch (err: unknown) {
    console.error("抓 Email 失敗:", url, getErrorDetail(err));
    return null;
  }
}

// ==============
// 工具：抓文章最近更新時間 + 活躍度
// ==============
function extractDateFromText($: any) {
  const mainText = $(".entry-content").text() || $(".post-content").text() || $("article").text() || $("body").text();
  if (!mainText) return null;
  const match = mainText.match(/(20\d{2})[./-](0[1-9]|1[0-2])[./-](0[1-9]|[12]\d|3[01])/);
  return match ? match[0] : null;
}

async function fetchLastUpdatedAt(url: string): Promise<string | null> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(html);

    const meta =
      $('meta[property="article:modified_time"]').attr("content") ||
      $('meta[property="article:published_time"]').attr("content") ||
      $('meta[property="og:updated_time"]').attr("content") ||
      $('meta[name="lastmod"]').attr("content") ||
      $('meta[name="pubdate"]').attr("content") ||
      $("time[datetime]").attr("datetime") ||
      null;

    let candidate = meta;
    if (!candidate) {
      const fromText = extractDateFromText($);
      candidate = fromText || null;
    }

    if (!candidate) return null;
    const trimmed = String(candidate).trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (err: unknown) {
    console.error("抓更新日期失敗:", url, getErrorDetail(err));
    return null;
  }
}

function classifyActivity(dateStr: string | null) {
  if (!dateStr) return "Unknown";
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "Unknown";
  const diffDays = (Date.now() - t) / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return "Active";
  if (diffDays <= 180) return "Normal";
  return "Old";
}

// ==============================
// 1) 用 Gemini 產生長尾關鍵字
// ==============================
app.post("/api/longtail-keywords", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "缺少 GEMINI_API_KEY 環境變數" });
    }

    const { keywords } = req.body;
    if (!keywords || typeof keywords !== "string") {
      return res.status(400).json({ error: "缺少 keywords 字串" });
    }

    const prompt = `
你是一位中文 SEO 專家。
下面是使用者輸入的「核心關鍵字」，每一行一組：

${keywords}

請根據這些核心關鍵字，發想更具商業價值的「長尾關鍵字」。
要求：
- 只輸出關鍵字本身，每行一個，不要加編號或多餘說明。
- 關鍵字請偏向「搜尋意圖明確」的字串，例如：台北信義區早午餐推薦、台中親子飯店2025等。
`;

    const GEMINI_MODEL = "models/gemini-2.0-flash"; // or 2.5 flash
    const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const { data } = await axios.post(url, {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    });

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    const longTailKeywords = text
      .split("\n")
      .map((line: string) => line.replace(/^[\d\.\-\)\s]+/, "").trim())
      .filter(Boolean);

    return res.json({ longTailKeywords });
  } catch (err: unknown) {
    const detail = getErrorDetail(err);
    console.error("產生長尾關鍵字失敗:", detail);
    return res.status(500).json({
      error: "產生長尾關鍵字失敗",
      detail: detail,
    });
  }
});

// ==============================
// 2) 儲存搜尋規則（目前先 log）
// ==============================
app.post("/api/search/config", (req, res) => {
  const config = req.body;
  console.log("收到搜尋規則設定：", JSON.stringify(config, null, 2));

  // 之後可以寫入資料庫 / 檔案，給 cron job 用
  return res.json({ ok: true });
});

// ==============================
// 3) 立即執行測試抓取 (SerpAPI)
// ==============================
app.post("/api/search/test", async (req, res) => {
  try {
    if (!SERP_API_KEY) {
      return res.status(500).json({ error: "缺少 SERP_API_KEY 環境變數" });
    }

    const config = req.body;
    console.log("測試抓取使用設定：", JSON.stringify(config, null, 2));

    const {
      coreKeywords = [],
      longTailKeywords = [],
      language = "zh-tw",
      region = "tw",
      negativeKeywords = [],
      excludeGovEdu = true,
      mustContainImages = true,
      // 新增兩個條件
      requireEmail = false,
      avoidDuplicates = false,
      // SerpAPI 分頁數（例如 3 -> start= num*1, num*2, num*3）
      serpPages = 1,
      // 新增文字數與流量篩選
      minWords = 0,
      maxTrafficRank = 0,
    } = config;

    const keywordsToUse =
      Array.isArray(longTailKeywords) && longTailKeywords.length > 0
        ? longTailKeywords
        : coreKeywords;

    // 用系統設定來決定每次 SerpAPI 要抓取的結果數量與分頁
    let serpNum = 10;
    let serpPagesFromSettings = 1;
    try {
      const s = await storage.getSettings();
      if (s && typeof (s as any).serpResultsNum === "number") serpNum = (s as any).serpResultsNum;
      if (s && typeof (s as any).serpPages === "number") serpPagesFromSettings = (s as any).serpPages;
    } catch (e) {
      console.warn("無法載入 settings，使用預設 serp num=10, pages=1", e);
    }

    const paramsBase = {
      engine: "google",
      api_key: SERP_API_KEY,
      hl: language,
      gl: region,
      num: serpNum,
    };

    const badWords: string[] = (negativeKeywords || []).map((w: any) => String(w).toLowerCase());

    const allResults: any[] = [];
    let totalSaved = 0;

    // 先讀取現有 leads，用來做跨批次去重
    const existingLeads = await storage.getBloggerLeads(1000);
    const existingDomains = new Set(
      existingLeads.map((l) => (l.domain || "").toLowerCase()).filter(Boolean)
    );

    for (const kw of keywordsToUse) {
      if (!kw) continue;

      // 根據 serpPages 做多次請求並合併結果
      // 若 request body 沒有提供 serpPages，使用系統設定值
      const serpPagesToUse = Number(serpPages || serpPagesFromSettings || 1);
      console.log(`[search/test] 使用 serp num = ${paramsBase.num}，pages = ${serpPagesToUse}，關鍵字查詢: ${kw}`);
      const aggregatedResults: any[] = [];
      const seenUrls = new Set<string>();
      let serpRequestsMade = 0;
      for (let p = 0; p < serpPagesToUse; p++) {
        const start = paramsBase.num * (p + 1); // user requested starts like num*1,num*2,...
        try {
          const { data } = await axios.get("https://serpapi.com/search", {
            params: { ...paramsBase, q: kw, start },
          });
          serpRequestsMade += 1;
          usageStats.serpapi.calls += 1;
          touchUsageUpdated();

          const pageResults: any[] = data.organic_results || [];
          for (const it of pageResults) {
            const url = (it.link || "").toLowerCase();
            if (!url) continue;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            aggregatedResults.push(it);
          }
        } catch (e) {
          console.warn(`[search/test] SerpAPI page request failed for start=${start}:`, getErrorDetail(e));
        }
      }

      const originalResults: any[] = aggregatedResults;

      // 逐一檢查每一筆，並保留被過濾的理由（filteredDetails）
      const candidates: Array<{
        item: any;
        domain: string;
        filteredDetails: string[];
        contactEmail?: string;
      }> = [];

      let imageOkCount = 0;

      for (const item of originalResults) {
        const title = (item.title || "").toLowerCase();
        const snippet = (item.snippet || "").toLowerCase();
        const url = (item.link || "");
        if (!url) {
          // skip empty urls but record reason
          candidates.push({ item, domain: "", filteredDetails: ["no_url"] });
          continue;
        }

        const reasons: string[] = [];
        const lowerUrl = url.toLowerCase();

        if (excludeGovEdu && (lowerUrl.includes(".gov") || lowerUrl.includes(".edu"))) {
          reasons.push("exclude_gov_edu");
        }

        if (badWords.some((w) => w && (title.includes(w) || snippet.includes(w)))) {
          reasons.push("negative_keyword");
        }

        // 圖片檢查（async）
        let hasImages = true;
        if (mustContainImages) {
          try {
            const ok = await hasEnoughImages(url, 3);
            hasImages = ok;
            if (!ok) {
              reasons.push("not_enough_images");
            } else {
              imageOkCount += 1;
            }
          } catch (e) {
            // 若檢查失敗，不視為直接排除，僅記 log
            console.warn("圖片檢查失敗：", url, getErrorDetail(e));
          }
        }

        let domain = "";
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = url;
        }
        const domainKey = domain.toLowerCase();

        let contactEmail = "";
        if (requireEmail) {
          const email = await fetchEmailFromPage(url);
          if (!email) {
            reasons.push("missing_email");
          } else {
            contactEmail = email;
          }
        }

        if (avoidDuplicates && existingDomains.has(domainKey)) {
          reasons.push("duplicate_domain");
        }

        // 若目前沒有任何理由則視為暫時通過（minWords 仍在寫入前檢查）
        if (!reasons.includes("duplicate_domain") && !existingDomains.has(domainKey)) {
          existingDomains.add(domainKey);
        }

        candidates.push({ item, domain, filteredDetails: reasons, contactEmail });
      }

      // 如果要求必須有圖片，但所有候選都沒有圖片，則恢復圖片條件（保留原有行為）
      if (mustContainImages && imageOkCount === 0) {
        for (const c of candidates) {
          c.filteredDetails = c.filteredDetails.filter((r) => r !== "not_enough_images");
        }
      }

      // 最終候選（尚未檢查 minWords）
      const deduped = candidates.filter((c) => c.filteredDetails.length === 0).map((c) => ({ ...c.item, domain: c.domain, contactEmail: c.contactEmail }));

      // 寫入 leads（呼叫 storage），在真正要寫入前才抓字數並以 minWords 做最後過濾
      const savedLeads: any[] = [];
      // 為了能在回傳中顯示哪些 url 因為字數不足而被過濾，我們準備一個 map
      const belowMinWordsUrls: Record<string, number | null> = {};

      for (let idx = 0; idx < deduped.length; idx++) {
        const item = deduped[idx];
        const link = item.link || "";
        if (!link) continue;

        const lastUpdatedAt = link ? await fetchLastUpdatedAt(link) : null;
        const activityStatus = classifyActivity(lastUpdatedAt);

        let wordCount: number | null = null;
        if (minWords && Number(minWords) > 0) {
          try {
            const wc = await fetchWordCount(link);
            if (wc === null || wc < Number(minWords)) {
              // 記錄為字數不足並跳過寫入
              belowMinWordsUrls[link] = wc;
              continue;
            }
            wordCount = wc;
          } catch (e) {
            console.warn("抓字數時發生錯誤，略過此筆：", link, e);
            continue;
          }
        }

        const insert = {
          title: item.title || "(無標題)",
          url: link,
          domain: item.domain || "",
          snippet: item.snippet || "",
          keywords: [kw],
          aiScore: 70 + (idx % 20),
          trafficEstimate: null,
          domainAuthority: null,
          serpRank: `#${idx + 1}`,
          contactEmail: item.contactEmail || "",
          wordCount: wordCount,
          aiAnalysis: "",
          status: "pending_review",
          lastUpdatedAt,
          activityStatus,
        } as any;

        try {
          const created = await storage.createBloggerLead(insert);
          savedLeads.push(created);
        } catch (e) {
          console.error("保存 lead 失敗:", getErrorDetail(e));
        }
      }

      totalSaved += savedLeads.length;

      // 準備回傳資料：包含每個原始結果的 filteredDetails（包含字數不足的資訊）
      const resultsForResponse = candidates.map((c) => {
        const url = c.item.link || "";
        const fd = [...c.filteredDetails];
        if (belowMinWordsUrls[url] !== undefined) {
          fd.push("below_min_words");
        }
        const status = fd.length === 0 ? "passed" : "filtered";
        return {
          title: c.item.title || "",
          url,
          domain: c.domain || "",
          status,
          reasons: fd,
        };
      });

      allResults.push({
        keyword: kw,
        total_results: null,
        returned_results_count: originalResults.length,
        passed_count: deduped.length,
        results: resultsForResponse,
        savedLeadCount: savedLeads.length,
        serpRequestsMade,
      });
    }

    // 計算跨所有 keyword 的總計資訊
    const totalReturnedUrls = allResults.reduce((sum, r) => sum + (r.returned_results_count || 0), 0);
    const totalPassed = allResults.reduce((sum, r) => sum + (r.passed_count || 0), 0);
    const totalFiltered = totalReturnedUrls - totalPassed;

    console.log(`[search/test] 全部關鍵字共寫入 ${totalSaved} 筆 leads (serpNum=${paramsBase.num})`);
    return res.json({
      ok: true,
      totalSaved,
      serpNumUsed: paramsBase.num,
      totalReturnedUrls,
      totalPassed,
      totalFiltered,
      results: allResults,
    });
  } catch (err: unknown) {
    const detail = getErrorDetail(err);
    console.error("SerpAPI 測試搜尋失敗:", detail);
    return res.status(500).json({
      error: "SerpAPI 測試搜尋失敗",
      detail: detail,
    });
  }
});

// ==============================
// 啟動伺服器
// ==============================
// ==============================
// API 使用量統計（暫存在記憶體；伺服器重啟會歸零）
// ==============================
const usageStats = {
  startedAt: new Date().toISOString(),
  lastUpdatedAt: null as string | null,
  gemini: {
    calls: 0,
    promptTokens: 0,
    candidateTokens: 0,
    totalTokens: 0,
  },
  serpapi: {
    calls: 0,
  },
};

function touchUsageUpdated() {
  usageStats.lastUpdatedAt = new Date().toISOString();
}

// ==============
// 工具：抓取文章字數（以文字數計）
// ==============
async function fetchWordCount(url: string): Promise<number | null> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(html);
    const mainText = $(".entry-content").text() || $(".post-content").text() || $("article").text() || $("body").text();
    if (!mainText) return null;
    const normalized = String(mainText).replace(/\s+/g, " ").trim();
    if (!normalized) return 0;
    const words = normalized.split(/\s+/).filter(Boolean).length;
    return words;
  } catch (err: unknown) {
    console.error("抓字數失敗:", url, getErrorDetail(err));
    return null;
  }
}

// SerpAPI 帳號資訊快取（避免每次 /api/usage 都打外部 API）
let serpapiAccountCache: { fetchedAt: number; data: any | null } = {
  fetchedAt: 0,
  data: null,
};

async function fetchSerpApiAccountInfo() {
  if (!SERP_API_KEY) return null;
  try {
    const { data } = await axios.get("https://serpapi.com/account", {
      params: { api_key: SERP_API_KEY },
    });
    serpapiAccountCache = { fetchedAt: Date.now(), data };
    return data;
  } catch (e: any) {
    console.error("取得 SerpAPI 帳號資訊失敗:", e?.response?.data || e?.message || e);
    return null;
  }
}

// 取得 API 使用量（含 SerpAPI 真實方案資訊）
app.get("/api/usage", async (req, res) => {
  const now = Date.now();
  if (!serpapiAccountCache.data || now - serpapiAccountCache.fetchedAt > 60_000) {
    await fetchSerpApiAccountInfo();
  }

  const acc = serpapiAccountCache.data;

  const serpapiInfo = {
    calls: usageStats.serpapi.calls,
    planMonthlyLimit: acc?.searches_per_month ?? null,
    thisMonthUsage: acc?.this_month_usage ?? null,
    totalSearchesLeft: acc?.total_searches_left ?? null,
  };

  touchUsageUpdated();

  return res.json({
    ...usageStats,
    serpapi: serpapiInfo,
  });
});

const httpServer = createServer(app);

// ✅ 在 listen 前先註冊所有路由 + 加上前端靜態檔案（production）
registerRoutes(httpServer, app).then(() => {
  // 只有在正式環境（NODE_ENV=production，例如 Render）才提供前端
  if (process.env.NODE_ENV === "production") {
    // build 完成後，前端會在 dist/public 底下
    const publicDir = path.join(process.cwd(), "dist", "public");

    // 服務靜態檔案（/assets/... 等）
    app.use(express.static(publicDir));

    // 除了 /api/... 以外的 GET，都回傳前端 index.html
    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  httpServer.listen(PORT, async () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`);

    // 初始化排程引擎
    await initializeScheduler();
  });
});
