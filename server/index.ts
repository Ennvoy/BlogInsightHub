// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio"; // ✅ 新增：用來解析 HTML 數圖片
import { createServer } from "http";
import { initializeScheduler } from "./scheduler"; // ✅ 導入排程引擎
import { registerRoutes } from "./routes"; // ✅ 導入路由

const app = express();

// === 健康檢查：方便測試 Render 有沒有活著 ===
app.get("/", (req, res) => {
  res.send("BlogInsightHub backend OK ✅");
});

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
// 工具：抓 HTML、計算 <img> 數量
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
    // console.log("圖片數:", imgCount, url);
    return imgCount >= min;
  } catch (err: unknown) {
    console.error("抓圖片失敗:", url, getErrorDetail(err));
    // 抓不到就視為不符合（因為使用者有開「必須包含圖片」）
    return false;
  }
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
      // minWords, maxTrafficRank 目前只記錄，真正要比對需再串 SimilarWeb / 文章長度
    } = config;

    const allKeywords = [...coreKeywords, ...longTailKeywords];
    const paramsBase = {
      engine: "google",
      api_key: SERP_API_KEY,
      hl: language,
      gl: region,
      num: 10,
    };

    const badWords = (negativeKeywords || []).map((w: string) =>
      String(w).toLowerCase()
    );

    const allResults = [];

    for (const kw of allKeywords) {
      if (!kw) continue;

      const { data } = await axios.get("https://serpapi.com/search", {
        params: { ...paramsBase, q: kw },
      });

      // -------- 第 1 階段：政府/學術 + 負面關鍵字過濾 --------
      const baseFiltered = (data.organic_results || []).filter((item: any) => {
        const title = (item.title || "").toLowerCase();
        const snippet = (item.snippet || "").toLowerCase();
        const url = (item.link || "").toLowerCase();

        // 排除政府 / 學術網域
        if (excludeGovEdu && (url.includes(".gov") || url.includes(".edu"))) {
          console.log("排除政府/學術網域:", url);
          return false;
        }

        // 排除關鍵字
        if (
          badWords.some(
            (w: any) => w && (title.includes(String(w)) || snippet.includes(String(w)))
          )
        ) {
          console.log("排除負面關鍵字:", kw, "→", title || snippet);
          return false;
        }

        return true;
      });

      let finalResults = baseFiltered;

      // -------- 第 2 階段：必須包含圖片（抓 HTML 算 <img>） --------
      if (mustContainImages) {
        console.log("啟用圖片數量過濾（至少 3 張）");
        const tmp = [];
        for (const item of baseFiltered) {
          const url = item.link;
          if (!url) continue;

          const ok = await hasEnoughImages(url, 3);
          if (ok) {
            tmp.push(item);
          } else {
            console.log("排除未達圖片數量:", url);
          }
        }
        finalResults = tmp;
      } else {
        console.log("未啟用圖片數量過濾，直接使用 baseFiltered");
      }

      allResults.push({
        keyword: kw,
        total_results: data.search_information?.total_results,
        filtered_count: finalResults.length,
        results: finalResults,
      });
    }

    return res.json({ ok: true, results: allResults });
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
const httpServer = createServer(app);

// ✅ 在 listen 前先註冊所有路由
registerRoutes(httpServer, app).then(() => {
  httpServer.listen(PORT, async () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`);

    // 初始化排程引擎
    await initializeScheduler();
  });
});

