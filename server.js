// server.js
import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import * as cron from "node-cron";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;

// ==============================
// API 使用量統計（暫存在記憶體；伺服器重啟會歸零）
// ==============================
const usageStats = {
  startedAt: new Date().toISOString(),
  lastUpdatedAt: null,
  gemini: {
    calls: 0,
    promptTokens: 0,
    candidateTokens: 0,
    totalTokens: 0,
  },
  serpapi: {
    calls: 0, // 我們自己實際呼叫 SerpAPI 的次數
  },
};

function touchUsageUpdated() {
  usageStats.lastUpdatedAt = new Date().toISOString();
}

// ==============================
// SerpAPI 帳號資訊快取（避免每次 /api/usage 都打外部 API）
// ==============================
let serpapiAccountCache = {
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
  } catch (e) {
    console.error(
      "取得 SerpAPI 帳號資訊失敗:",
      e.response?.data || e.message
    );
    return null;
  }
}

// ==============================
// blogger-leads 資料儲存設定（JSON 檔）
// ==============================
const DATA_PATH = path.join(process.cwd(), "data", "blogger-leads.json");

async function readLeads() {
  try {
    const buf = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(buf);
  } catch {
    return [];
  }
}

async function writeLeads(leads) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(leads, null, 2), "utf-8");
}

function genId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

// ==============================
// 工具：抓 HTML、計算 <img> 數量
// ==============================
async function hasEnoughImages(url, min = 3) {
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
  } catch (e) {
    console.error("抓圖片失敗:", url, e.message);
    return false;
  }
}

// ==============================
// 工具：從 HTML 抓 Email
// ==============================
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractFirstEmailFromHtml(html) {
  if (!html) return null;
  const matches = html.match(EMAIL_REGEX);
  if (!matches || matches.length === 0) return null;
  // 簡單回第一個就好
  return matches[0];
}

async function fetchEmailFromPage(url) {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return extractFirstEmailFromHtml(html);
  } catch (e) {
    console.error("抓 Email 失敗:", url, e.message);
    return null;
  }
}

// ==============================
// 工具：從文字裡猜日期（fallback 用）
// ==============================
function extractDateFromText($) {
  const mainText =
    $(".entry-content").text() ||
    $(".post-content").text() ||
    $("article").text() ||
    $("body").text();

  if (!mainText) return null;

  const match = mainText.match(
    /(20\d{2})[./-](0[1-9]|1[0-2])[./-](0[1-9]|[12]\d|3[01])/
  );

  return match ? match[0] : null;
}

// ==============================
// 工具：抓文章最近更新時間 + 活躍度
// ==============================
async function fetchLastUpdatedAt(url) {
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

    const trimmed = candidate.trim();
    if (!trimmed) return null;

    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;

    return d.toISOString();
  } catch (e) {
    console.error("抓更新日期失敗:", url, e.message);
    return null;
  }
}

function classifyActivity(dateStr) {
  if (!dateStr) return "Unknown";
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "Unknown";

  const diffDays = (Date.now() - t) / (1000 * 60 * 60 * 24);

  if (diffDays <= 30) return "Active";
  if (diffDays <= 180) return "Normal";
  return "Old";
}

// ==============================
// 把 SerpAPI 的結果轉成 blogger lead 格式並存檔
// ==============================
async function saveLeadsFromSerp(keyword, serpResults) {
  const leads = await readLeads();
  const now = new Date().toISOString();
  const newLeads = [];

  for (let idx = 0; idx < serpResults.length; idx++) {
    const item = serpResults[idx];
    const link = item.link || "";
    if (!link) continue;

    let domain = item.domain || "";
    try {
      if (!domain) {
        domain = new URL(link).hostname.replace(/^www\./, "");
      }
    } catch {
      if (!domain) domain = link;
    }

    const lastUpdatedAt = link ? await fetchLastUpdatedAt(link) : null;
    const activityStatus = classifyActivity(lastUpdatedAt);

    const contactEmail = item.contactEmail || "";

    newLeads.push({
      id: genId(),
      createdAt: now,
      title: item.title || "(無標題)",
      url: link,
      domain,
      snippet: item.snippet || "",
      keywords: [keyword],
      aiScore: 70 + (idx % 20),
      trafficEstimate: null,
      domainAuthority: null,
      serpRank: `#${idx + 1}`,
      contactEmail,
      aiAnalysis: "",
      status: "pending_review",

      // 新欄位
      lastUpdatedAt, // ISO string 或 null
      activityStatus, // "Active" | "Normal" | "Old" | "Unknown"
    });
  }

  leads.push(...newLeads);
  await writeLeads(leads);
  console.log(
    `[saveLeadsFromSerp] keyword="${keyword}" 新增 ${newLeads.length} 筆 leads`
  );
  return newLeads;
}

// ==============================
// Schedules: minimal persistence + cron registration
// (為了相容前端 dev workflow，我在此檔案提供簡單實作，不改其他檔案)
// ==============================

const SCHEDULES_PATH = path.join(process.cwd(), "data", "schedules.json");

async function readSchedules() {
  try {
    const buf = await fs.readFile(SCHEDULES_PATH, "utf-8");
    return JSON.parse(buf);
  } catch (e) {
    return [];
  }
}

async function writeSchedules(schedules) {
  await fs.mkdir(path.dirname(SCHEDULES_PATH), { recursive: true });
  await fs.writeFile(SCHEDULES_PATH, JSON.stringify(schedules, null, 2), "utf-8");
}

const registeredTasks = new Map();

function toCronExpression(schedule) {
  const minute = Number(schedule.minute ?? 0);
  const hour = Number(schedule.hour ?? 0);
  if (schedule.frequency === "daily") {
    return `${minute} ${hour} * * *`;
  } else if (schedule.frequency === "weekly") {
    const dow = Number(schedule.dayOfWeek ?? 0);
    return `${minute} ${hour} * * ${dow}`;
  } else if (schedule.frequency === "monthly") {
    const dom = Number(schedule.dayOfMonth ?? 1);
    return `${minute} ${hour} ${dom} * *`;
  }
  return `${minute} ${hour} * * *`;
}

function unregisterSchedule(scheduleId) {
  const task = registeredTasks.get(scheduleId);
  if (task) {
    try { task.stop(); } catch (e) {}
    registeredTasks.delete(scheduleId);
    console.log(`[schedules] Unregistered schedule ${scheduleId}`);
  }
}

function registerSchedule(schedule) {
  try {
    // skip if disabled or enabledAt in future
    const now = new Date();
    if (!schedule.isEnabled) {
      console.log(`[schedules] Skipping disabled schedule ${schedule.id}`);
      return;
    }
    if (schedule.enabledAt) {
      const en = new Date(schedule.enabledAt);
      if (en > now) {
        console.log(`[schedules] Skipping schedule ${schedule.id} until ${en.toISOString()}`);
        return;
      }
    }

    const expr = toCronExpression(schedule);
    console.log(`[schedules] Registering schedule ${schedule.id} (${schedule.name}) cron=${expr}`);

    // ensure no duplicate
    unregisterSchedule(schedule.id);

    const API_BASE = `http://127.0.0.1:${PORT}`;

    const task = cron.schedule(expr, async () => {
      try {
        console.log(`[schedules] Executing schedule ${schedule.id} -> calling /api/search/test`);
        const payload = {
          coreKeywords: schedule.coreKeywords || [],
          longTailKeywords: [],
          industry: schedule.searchConfig?.industry,
          language: schedule.searchConfig?.language,
          region: schedule.searchConfig?.region,
          minWords: schedule.searchConfig?.minWords,
          maxTrafficRank: schedule.searchConfig?.maxTrafficRank,
          excludeGovEdu: schedule.searchConfig?.excludeGovEdu,
          mustContainImages: schedule.searchConfig?.requireImages,
          requireEmail: schedule.searchConfig?.requireEmail,
          avoidDuplicates: schedule.searchConfig?.avoidDuplicates,
          negativeKeywords: schedule.searchConfig?.negativeKeywords || [],
        };

        await axios.post(`${API_BASE}/api/search/test`, payload, { timeout: 60000 });
        console.log(`[schedules] Schedule ${schedule.id} executed`);
      } catch (err) {
        console.error(`[schedules] Schedule execution failed ${schedule.id}:`, err?.message || err);
      }
    });

    registeredTasks.set(schedule.id, task);
  } catch (e) {
    console.error("[schedules] registerSchedule error:", e);
  }
}

async function refreshAllSchedulesOnStartup() {
  const list = await readSchedules();
  console.log(`[schedules] Found ${list.length} schedules on disk`);
  for (const s of list) {
    registerSchedule(s);
  }
}

// REST endpoints for schedules
app.get('/api/schedules', async (req, res) => {
  const list = await readSchedules();
  res.json(list);
});

app.get('/api/schedules/:id', async (req, res) => {
  const id = req.params.id;
  const list = await readSchedules();
  const found = list.find((x) => x.id === id);
  if (!found) return res.status(404).json({ error: 'Schedule not found' });
  res.json(found);
});

app.post('/api/schedules', async (req, res) => {
  try {
    const body = req.body || {};
    const list = await readSchedules();
    const id = (Date.now().toString(36) + Math.random().toString(36).slice(2,8)).toUpperCase();
    const now = new Date().toISOString();
    const schedule = {
      id,
      name: body.name || 'Schedule',
      frequency: body.frequency || 'daily',
      dayOfWeek: body.dayOfWeek ?? null,
      dayOfMonth: body.dayOfMonth ?? null,
      hour: body.hour ?? 0,
      minute: body.minute ?? 0,
      isEnabled: body.isEnabled !== undefined ? body.isEnabled : true,
      enabledAt: body.enabledAt ? new Date(body.enabledAt).toISOString() : now,
      coreKeywords: body.coreKeywords || [],
      searchConfig: body.searchConfig || null,
      createdAt: now,
      updatedAt: now,
    };

    list.push(schedule);
    await writeSchedules(list);

    // register
    registerSchedule(schedule);

    res.status(201).json(schedule);
  } catch (err) {
    console.error('[schedules] create error', err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

app.patch('/api/schedules/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const list = await readSchedules();
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
    const cur = list[idx];
    const updated = { ...cur, ...body, updatedAt: new Date().toISOString() };
    if (body.enabledAt) updated.enabledAt = new Date(body.enabledAt).toISOString();
    list[idx] = updated;
    await writeSchedules(list);

    // refresh registration
    unregisterSchedule(id);
    registerSchedule(updated);

    res.json(updated);
  } catch (err) {
    console.error('[schedules] patch error', err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const list = await readSchedules();
    const newList = list.filter((x) => x.id !== id);
    if (newList.length === list.length) return res.status(404).json({ error: 'Schedule not found' });
    await writeSchedules(newList);
    unregisterSchedule(id);
    res.status(204).send();
  } catch (err) {
    console.error('[schedules] delete error', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// load and register existing schedules on startup
refreshAllSchedulesOnStartup().catch((e)=>console.error('[schedules] startup load error', e));

// ==============================
// 1) 用 Gemini 產生長尾關鍵字
// ==============================
app.post("/api/longtail-keywords", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "缺少 GEMINI_API_KEY 環境變數" });
    }

    let { keywords, perLine } = req.body;
    if (!keywords || typeof keywords !== "string") {
      return res.status(400).json({ error: "缺少 keywords 字串" });
    }

    let n = Number(perLine);
    if (!Number.isFinite(n) || n <= 0) {
      return res.json({ longTailKeywords: [] });
    }
    n = Math.min(10, Math.floor(n));

    const coreList = String(keywords)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const coreCount = coreList.length || 1;
    const totalLimit = coreCount * n;

    const prompt = `
你是一位中文 SEO 專家。
下面是使用者輸入的「核心關鍵字」，每一行一組（共 ${coreCount} 行）：

${coreList.map((k, i) => `${i + 1}. ${k}`).join("\n")}

請針對「每一行核心關鍵字」，各自發想大約 ${n} 個相關且具商業價值的長尾關鍵字。
規則：
- 總輸出行數 ≈ ${totalLimit} 行。
- 只輸出長尾關鍵字本身，每行一個，不要加編號或任何前綴（例如「1.」或「-」）。
- 盡量避免重複或意義高度相同的關鍵字。
`;

    const GEMINI_MODEL = "models/gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const { data } = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
    });

    // ✅ 統計 Gemini 用量
    usageStats.gemini.calls += 1;
    const usageMeta = data?.usageMetadata || {};
    usageStats.gemini.promptTokens += usageMeta.promptTokenCount ?? 0;
    usageStats.gemini.candidateTokens +=
      usageMeta.candidatesTokenCount ?? 0;
    usageStats.gemini.totalTokens += usageMeta.totalTokenCount ?? 0;
    touchUsageUpdated();

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    let longTailKeywords = text
      .split("\n")
      .map((line) => line.replace(/^[\d\.\-\)\s]+/, "").trim())
      .filter(Boolean);

    if (totalLimit > 0) {
      longTailKeywords = longTailKeywords.slice(0, totalLimit);
    }

    return res.json({ longTailKeywords });
  } catch (err) {
    console.error("產生長尾關鍵字失敗:", err.response?.data || err.message);
    return res.status(500).json({
      error: "產生長尾關鍵字失敗",
      detail: err.response?.data || String(err),
    });
  }
});

// ==============================
// 2) 儲存搜尋規則（目前先 log）
// ==============================
app.post("/api/search/config", (req, res) => {
  const config = req.body;
  console.log("收到搜尋規則設定：", JSON.stringify(config, null, 2));
  return res.json({ ok: true });
});

// ==============================
// 3) 測試抓取 (SerpAPI + 圖片過濾 + Email + 去重 + 寫入 leads)
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
      language = "zh-TW",
      region = "tw",
      negativeKeywords = [],
      excludeGovEdu = true,
      mustContainImages = true,
      // 🔹 新增兩個條件
      requireEmail = false,
      avoidDuplicates = false,
    } = config;

    const keywordsToUse =
      Array.isArray(longTailKeywords) && longTailKeywords.length > 0
        ? longTailKeywords
        : coreKeywords;

    console.log(
      "實際搜尋關鍵字來源：",
      longTailKeywords.length > 0 ? "longTailKeywords" : "coreKeywords"
    );
    console.log("keywordsToUse =", keywordsToUse);

    const paramsBase = {
      engine: "google",
      api_key: SERP_API_KEY,
      hl: language,
      gl: region,
      num: 10,
    };

    const badWords = (negativeKeywords || []).map((w) =>
      String(w).toLowerCase()
    );

    const allResults = [];
    let totalSaved = 0;

    // ✅ 先讀取現有 leads，用來做跨批次去重
    const existingLeads = await readLeads();
    const existingDomains = new Set(
      existingLeads
        .map((l) => (l.domain || "").toLowerCase())
        .filter(Boolean)
    );

    for (const kw of keywordsToUse) {
      if (!kw) continue;

      // ✅ 統計 SerpAPI 呼叫次數
      usageStats.serpapi.calls += 1;
      touchUsageUpdated();

      const { data } = await axios.get("https://serpapi.com/search", {
        params: { ...paramsBase, q: kw },
      });

      // 第一次過濾：政府 / 學術 / 負面關鍵字
      const baseFiltered = (data.organic_results || []).filter((item) => {
        const title = (item.title || "").toLowerCase();
        const snippet = (item.snippet || "").toLowerCase();
        const url = (item.link || "").toLowerCase();

        if (excludeGovEdu && (url.includes(".gov") || url.includes(".edu"))) {
          return false;
        }

        if (
          badWords.some(
            (w) => w && (title.includes(w) || snippet.includes(w))
          )
        ) {
          return false;
        }

        return true;
      });

      // 第二層：圖片條件
      let finalResults = baseFiltered;

      if (mustContainImages) {
        const tmp = [];
        for (const item of baseFiltered) {
          const url = item.link;
          if (!url) continue;
          const ok = await hasEnoughImages(url, 3);
          if (ok) tmp.push(item);
        }

        // 圖片條件太嚴導致一個都沒有，但 baseFiltered 有東西 → 退而求其次用 baseFiltered
        finalResults = tmp.length > 0 ? tmp : baseFiltered;
      }

      // 第三層：Email 條件 + 網域去重
      const deduped = [];
      for (const item of finalResults) {
        const url = item.link;
        if (!url) continue;

        let domain = "";
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = url;
        }
        const domainKey = domain.toLowerCase();

        // 需要 Email → 先抓 Email，抓不到就丟掉
        let contactEmail = "";
        if (requireEmail) {
          const email = await fetchEmailFromPage(url);
          if (!email) {
            continue;
          }
          contactEmail = email;
        }

        // 避免重複：看現有 + 本批次
        if (avoidDuplicates && existingDomains.has(domainKey)) {
          continue;
        }

        existingDomains.add(domainKey);

        deduped.push({
          ...item,
          domain,
          contactEmail,
        });
      }

      const savedLeads = await saveLeadsFromSerp(kw, deduped);
      totalSaved += savedLeads.length;

      allResults.push({
        keyword: kw,
        total_results: data.search_information?.total_results,
        filtered_count: deduped.length, // 已經包含 Email + 去重
        results: deduped,
        savedLeadCount: savedLeads.length,
      });
    }

    console.log(`[search/test] 全部關鍵字共寫入 ${totalSaved} 筆 leads`);

    return res.json({ ok: true, totalSaved, results: allResults });
  } catch (err) {
    console.error("SerpAPI 測試搜尋失敗:", err.response?.data || err.message);
    return res.status(500).json({
      error: "SerpAPI 測試搜尋失敗",
      detail: err.response?.data || String(err),
    });
  }
});

// ==============================
// 4) Blogger Leads API
// ==============================
app.get("/api/blogger-leads", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    const status = req.query.status;

    let leads = await readLeads();

    if (status) {
      leads = leads.filter((l) => l.status === status);
    }

    leads.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    return res.json(leads.slice(0, limit));
  } catch (err) {
    console.error("讀取 blogger leads 失敗:", err.message);
    return res.status(500).json({ error: "讀取 blogger leads 失敗" });
  }
});

app.post("/api/blogger-leads", async (req, res) => {
  try {
    const body = req.body || {};
    const leads = await readLeads();
    const now = new Date().toISOString();

    const newLead = {
      id: genId(),
      createdAt: now,
      status: body.status || "pending_review",
      title: body.title || "(無標題)",
      url: body.url || "",
      domain: body.domain || "",
      snippet: body.snippet || "",
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      aiScore: Number(body.aiScore ?? 0),
      trafficEstimate: body.trafficEstimate ?? null,
      domainAuthority: body.domainAuthority ?? null,
      serpRank: body.serpRank ?? "",
      contactEmail: body.contactEmail ?? "",
      aiAnalysis: body.aiAnalysis ?? "",
      lastUpdatedAt: body.lastUpdatedAt ?? null,
      activityStatus: body.activityStatus ?? "Unknown",
    };

    leads.push(newLead);
    await writeLeads(leads);

    return res.status(201).json(newLead);
  } catch (err) {
    console.error("新增 blogger lead 失敗:", err.message);
    return res.status(500).json({ error: "新增 blogger lead 失敗" });
  }
});

app.patch("/api/blogger-leads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};

    let leads = await readLeads();
    const idx = leads.findIndex((l) => l.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Lead not found" });
    }

    leads[idx] = { ...leads[idx], ...patch };
    await writeLeads(leads);

    console.log("已更新 lead 狀態:", id, "→", patch);
    return res.json(leads[idx]);
  } catch (err) {
    console.error("更新 blogger lead 失敗:", err.message);
    return res.status(500).json({ error: "更新 blogger lead 失敗" });
  }
});

app.delete("/api/blogger-leads/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await readLeads();
    const next = leads.filter((l) => l.id !== id);
    await writeLeads(next);
    return res.json({ ok: true });
  } catch (err) {
    console.error("刪除 blogger lead 失敗:", err.message);
    return res.status(500).json({ error: "刪除 blogger lead 失敗" });
  }
});

// ==============================
// 5) 取得 API 使用量（含 SerpAPI 真實方案資訊）
// ==============================
app.get("/api/usage", async (req, res) => {
  const now = Date.now();
  if (!serpapiAccountCache.data || now - serpapiAccountCache.fetchedAt > 60_000) {
    await fetchSerpApiAccountInfo();
  }

  const acc = serpapiAccountCache.data;

  const serpapiInfo = {
    // 你自己實際打出去的次數
    calls: usageStats.serpapi.calls,

    // SerpAPI 帳戶實際方案 / 用量
    planMonthlyLimit: acc?.searches_per_month ?? null,
    thisMonthUsage: acc?.this_month_usage ?? null,
    totalSearchesLeft: acc?.total_searches_left ?? null,
  };

  return res.json({
    ...usageStats,
    serpapi: serpapiInfo,
  });
});

// ==============================
// 啟動伺服器
// ==============================
app.listen(PORT, () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});
