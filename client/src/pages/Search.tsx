import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Search as SearchIcon, Save, RefreshCw } from "lucide-react";
import { createSchedule, getSettings } from "@/lib/api";

const API_BASE = "http://127.0.0.1:5001";

function mapLangRegion(value: string) {
  switch (value) {
    case "en-us":
      return { language: "en", region: "us" };
    case "ja-jp":
      return { language: "ja", region: "jp" };
    case "zh-tw":
    default:
      return { language: "zh-TW", region: "tw" };
  }
}

type UsageResponse = {
  startedAt?: string;
  lastUpdatedAt?: string | null;
  gemini: {
    calls: number;
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  };
  serpapi: {
    calls: number;
    planMonthlyLimit: number | null;
    thisMonthUsage: number | null;
    totalSearchesLeft: number | null;
  };
};

type PreviewInput = {
  coreKeywords: string;
  longTailKeywords: string[];
  longTailCount: number | null;
  minWords: number;
  maxTrafficRank: number;
  excludeGovEdu: boolean;
  mustContainImages: boolean;
  requireEmail: boolean;
  avoidDuplicates: boolean;
};

type PreviewResult = {
  dailyUrls: number;
  passedCount: number;
  filterRate: number; // 0~100
  strictLevelLabel: string; // 非常嚴格 / 中等嚴格 / 較寬鬆 / 尚未設定關鍵字
  suggestion: string;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * 預估產出計算器
 * 目前是「規則 + 估算」，之後你有真實數據再一起校正。
 */
function estimatePreview(input: PreviewInput, resultsPerKeyword = 10): PreviewResult {
  const {
    coreKeywords,
    longTailKeywords,
    longTailCount,
    minWords,
    maxTrafficRank,
    excludeGovEdu,
    mustContainImages,
    requireEmail,
    avoidDuplicates,
  } = input;

  const coreList = coreKeywords
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // 有產長尾而且有開啟 → 使用長尾關鍵字數量，否則用核心關鍵字行數
  const keywordCount =
    longTailCount && longTailCount > 0 && longTailKeywords.length > 0
      ? longTailKeywords.length
      : coreList.length;

  // 根據系統設定的每關鍵字抓取數量計算每日 URL 數
  const dailyUrls = keywordCount * resultsPerKeyword;

  if (dailyUrls === 0) {
    return {
      dailyUrls: 0,
      passedCount: 0,
      filterRate: 0,
      strictLevelLabel: "尚未設定關鍵字",
      suggestion: "請先輸入至少一組核心關鍵字，系統才有資料可以預估。",
    };
  }

  // 嚴格度評分（0 = 很鬆，1 = 超嚴格）
  const strictWords = clamp01(minWords / 3000); // 字數越高越嚴
  const strictTraffic =
    1 - Math.min(maxTrafficRank, 10_000_000) / 10_000_000; // 排名數值越小越嚴

  let strictScore = 0.4 * strictWords + 0.4 * strictTraffic;
  if (excludeGovEdu) strictScore += 0.08;
  if (mustContainImages) strictScore += 0.12;
  if (requireEmail) strictScore += 0.15; // 要有 Email 會砍掉一大票
  if (avoidDuplicates) strictScore += 0.05; // 去重稍微加嚴一點
  strictScore = clamp01(strictScore);

  // 通過比例：鬆 → 大約 40%，超嚴 → 壓到 5% 左右
  let passRate = 0.4 - strictScore * 0.35;
  passRate = Math.max(0.02, Math.min(0.6, passRate));

  const passedCount = Math.round(dailyUrls * passRate);
  const filterRate =
    dailyUrls > 0 ? 100 - (passedCount / dailyUrls) * 100 : 0;

  let strictLevelLabel = "";
  let suggestion = "";

  if (strictScore >= 0.7) {
    strictLevelLabel = "非常嚴格";
    suggestion =
      "當前設定非常嚴格。如果初期名單不足，建議放寬「網站流量排名」或降低「文章字數」要求，或暫時關閉「必須找到 Email」。";
  } else if (strictScore >= 0.4) {
    strictLevelLabel = "中等嚴格";
    suggestion =
      "目前設定屬於中等嚴格。可以先觀察幾天的實際名單量，再視情況微調字數、流量排名或 Email 條件。";
  } else {
    strictLevelLabel = "較寬鬆";
    suggestion =
      "目前設定較寬鬆。如果希望內容品質更好，可以提高「文章字數下限」、收緊「網站流量排名」，並啟用「必須找到 Email」。";
  }

  return {
    dailyUrls,
    passedCount,
    filterRate,
    strictLevelLabel,
    suggestion,
  };
}

const DEFAULT_SERPAPI_MONTHLY_LIMIT = 1000; // 抓不到帳號資訊時的預設視覺值
const GEMINI_TOKEN_LIMIT = 500_000; // 你可以依照自己習慣調整

export default function SearchPage() {
  const [, setLocation] = useLocation();

  // ====== 基本條件 ======
  const [industry, setIndustry] = useState("travel");
  const [langRegion, setLangRegion] = useState("zh-tw");

  const [coreKeywords, setCoreKeywords] = useState(
    "台北 美食 推薦\n台中 餐廳 2025\n高雄 必吃\n台南 小吃 排隊"
  );

  // 長尾關鍵字
  const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
  const [longTailCount, setLongTailCount] = useState<number | null>(5); // 每行產幾個
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Level 2 Filter
  const [minWords, setMinWords] = useState(800);
  const [maxTrafficRank, setMaxTrafficRank] = useState(5_000_000);
  const [excludeGovEdu, setExcludeGovEdu] = useState(true);
  const [mustContainImages, setMustContainImages] = useState(true);
  const [negativeKeywords, setNegativeKeywords] = useState(
    "賭博, 色情, 政治, 新聞稿, 官方公告"
  );

  // 🔹 新增兩個過濾條件
  const [requireEmail, setRequireEmail] = useState(true);
  const [avoidDuplicates, setAvoidDuplicates] = useState(true);

  // 🔹 排程設定
  const [scheduleName, setScheduleName] = useState("自動排程");
  const [scheduleFrequency, setScheduleFrequency] = useState("daily");
  const [scheduleDay, setScheduleDay] = useState(1); // for weekly/monthly
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  // 新增：排程開始日期（yyyy-mm-dd）
  const [scheduleStartDate, setScheduleStartDate] = useState<string | null>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResponse, setTestResponse] = useState<any | null>(null);

  // API usage
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // 從系統設定讀取每個關鍵字要抓取的結果數（影響預估產出）
  const [resultsPerKeyword, setResultsPerKeyword] = useState<number>(10);
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setSettingsLoading(true);
    getSettings()
      .then((s) => {
        if (!mounted) return;
        if (s && typeof s.serpResultsNum === "number") setResultsPerKeyword(s.serpResultsNum);
      })
      .catch((e) => console.warn("Failed to load settings:", e))
      .finally(() => mounted && setSettingsLoading(false));
    return () => { mounted = false };
  }, []);

  // ==============================
  // 取得 API 使用量（可重複呼叫 → 即時更新用）
  // ==============================
  const fetchUsage = async () => {
    try {
      setUsageLoading(true);
      setUsageError(null);
      const res = await fetch(`${API_BASE}/api/usage`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as UsageResponse;
      setUsage(data);
    } catch (err: any) {
      console.error("取得 API 使用量失敗", err);
      setUsageError(err.message || "取得 API 使用量失敗");
    } finally {
      setUsageLoading(false);
    }
  };

  // 進頁面時抓一次
  useEffect(() => {
    fetchUsage();
  }, []);

  // ==============================
  // 產生長尾關鍵字（每行核心各 N 個）
  // ==============================
  const handleGenerateLongTailKeywords = async () => {
    if (!longTailCount || longTailCount <= 0) {
      setGeneratedKeywords([]);
      setGenerateError(null);
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const coreList = coreKeywords
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const totalLimit = coreList.length * longTailCount;

      const res = await fetch(`${API_BASE}/api/longtail-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: coreKeywords,
          perLine: longTailCount, // 告訴後端「每行幾個」
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const list: string[] = (data.longTailKeywords || []).map((s: string) =>
        String(s || "").trim()
      );

      // 規則：每個核心關鍵字（coreList 的每一行）要產生 longTailCount 個
      // 且不能與核心關鍵字完全相同；若同一核心不足則從其他候選補足。
      const perLine = longTailCount && longTailCount > 0 ? longTailCount : 0;
      const totalNeeded = coreList.length * perLine;

      const normalizedCores = coreList.map((c) => c.toLowerCase());

      const picked: string[] = [];

      // 1) 先針對每個核心挑選包含該核心字串的候選（且不等於核心本身）
      for (const core of coreList) {
        if (picked.length >= totalNeeded) break;
        let taken = 0;
        for (const cand of list) {
          if (taken >= perLine) break;
          if (!cand) continue;
          const cLower = core.toLowerCase();
          const candLower = cand.toLowerCase();
          if (candLower === cLower) continue; // 不允許與核心完全相同
          if (!candLower.includes(cLower)) continue; // 優先包含核心字
          if (picked.includes(cand)) continue; // 不重複
          picked.push(cand);
          taken += 1;
        }
      }

      // 2) 若還沒湊齊，從剩下的候選補足（去除與任何核心相同的）
      if (picked.length < totalNeeded) {
        for (const cand of list) {
          if (picked.length >= totalNeeded) break;
          if (!cand) continue;
          const candLower = cand.toLowerCase();
          if (normalizedCores.includes(candLower)) continue; // 跳過與任一核心相同
          if (picked.includes(cand)) continue;
          picked.push(cand);
        }
      }

      // 3) 最後保險切到需求長度
      const finalList = totalNeeded > 0 ? picked.slice(0, totalNeeded) : [];

      setGeneratedKeywords(finalList);

      // ✅ 產生長尾成功後重新抓 usage → 即時更新 Gemini 用量
      fetchUsage();
    } catch (err: any) {
      console.error("前端呼叫長尾關鍵字 API 失敗", err);
      setGenerateError(err.message || "AI 產生失敗，請稍後再試");
    } finally {
      setIsGenerating(false);
    }
  };

  // ==============================
  // 儲存設定
  // ==============================
  const handleSaveConfig = async () => {
    try {
      const { language, region } = mapLangRegion(langRegion);

      const payload = {
        industry,
        language,
        region,
        coreKeywords: coreKeywords
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        longTailKeywords:
          longTailCount && longTailCount > 0 ? generatedKeywords.slice(0) : [],
        minWords,
        maxTrafficRank,
        excludeGovEdu,
        mustContainImages,
        negativeKeywords: negativeKeywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        // 🔹 新增兩個條件寫進後端
        requireEmail,
        avoidDuplicates,
      };

      await fetch(`${API_BASE}/api/search/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      alert("設定已儲存（目前僅寫入後端 log）");
    } catch (err) {
      console.error("儲存設定失敗", err);
      alert("儲存設定失敗，請查看 console");
    }
  };

  // ==============================
  // 立即執行測試抓取 → 後端寫入 leads → /results
  // ==============================
  const handleTestFetch = async () => {
    setIsTesting(true);
    setTestError(null);

    try {
      const { language, region } = mapLangRegion(langRegion);

      const payload = {
        industry,
        language,
        region,
        coreKeywords: coreKeywords
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        longTailKeywords:
          longTailCount && longTailCount > 0 ? generatedKeywords.slice(0) : [],
        minWords,
        maxTrafficRank,
        excludeGovEdu,
        mustContainImages,
        negativeKeywords: negativeKeywords
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        requireEmail,
        avoidDuplicates,
      };

      const res = await fetch(`${API_BASE}/api/search/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log("測試抓取結果", data);

      // 保存並顯示回傳結果以便 Debug：包含每筆 filteredDetails、returned_results_count、serpNumUsed
      localStorage.setItem("searchTestResults", JSON.stringify(data));
      setTestResponse(data);

      // ✅ 測試抓取成功後重新抓 usage（SerpAPI 用量）
      fetchUsage();

      // ✅ 導到 results，ResultsPage 會用 getBloggerLeads 讀最新資料
      setLocation("/results");
    } catch (err: any) {
      console.error("測試抓取失敗", err);
      setTestError(err.message || "測試抓取失敗，請稍後再試");
    } finally {
      setIsTesting(false);
    }
  };

  // ==============================
  // 儲存設定並建立排程
  // ==============================
  const handleSaveAndSchedule = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      const { language, region } = mapLangRegion(langRegion);

      const keywordsList = coreKeywords
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const negativeKeywordsList = negativeKeywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // Create schedule with embedded search config
      const schedule = await createSchedule({
        name: scheduleName || `Schedule - ${new Date().toLocaleString()}`,
        frequency: scheduleFrequency as "daily" | "weekly" | "monthly",
        dayOfWeek: scheduleFrequency === "weekly" ? (parseInt(String(scheduleDay)) as any) : undefined,
        dayOfMonth: scheduleFrequency === "monthly" ? (parseInt(String(scheduleDay)) as any) : undefined,
        hour: parseInt(String(scheduleHour)) as any,
        minute: parseInt(String(scheduleMinute)) as any,
        searchConfig: {
          industry,
          language,
          region,
          minWords,
          maxTrafficRank,
          excludeGovEdu,
          requireImages: mustContainImages,
          requireEmail: requireEmail,
          avoidDuplicates: avoidDuplicates,
          negativeKeywords: negativeKeywordsList,
        },
        // enabledAt: combine start date + hour into a Date (local time)
        enabledAt: (() => {
          try {
            if (!scheduleStartDate) return undefined;
            // combine date and hour (local time)
            const dateTime = `${scheduleStartDate}T${String(scheduleHour).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}:00`;
            const d = new Date(dateTime);
            return d; // return Date to match expected type
          } catch (e) {
            return undefined;
          }
        })(),
        coreKeywords: keywordsList,
      });

      alert(`排程已建立！ID: ${schedule.id}`);
      
      // Optional: Reset form
      setScheduleName("");
    } catch (err: any) {
      console.error("儲存排程失敗", err);
      setSaveError(err.message || "儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  };

  // ====== SerpAPI / Gemini 百分比計算 ======
  const serpTotal =
    usage?.serpapi.planMonthlyLimit ?? DEFAULT_SERPAPI_MONTHLY_LIMIT;
  const serpUsed = usage?.serpapi.thisMonthUsage ?? usage?.serpapi.calls ?? 0;
  const serpPct =
    serpTotal && serpTotal > 0
      ? Math.min(100, Math.round((serpUsed / serpTotal) * 100))
      : 0;

  const gemUsed = usage?.gemini.totalTokens ?? 0;
  const gemPct =
    GEMINI_TOKEN_LIMIT > 0
      ? Math.min(100, Math.round((gemUsed / GEMINI_TOKEN_LIMIT) * 100))
      : 0;

  // ====== 預估產出（會隨設定即時變化） ======
  const preview = useMemo(
    () =>
      estimatePreview(
        {
        coreKeywords,
        longTailKeywords: generatedKeywords,
        longTailCount,
        minWords,
        maxTrafficRank,
        excludeGovEdu,
        mustContainImages,
        requireEmail,
        avoidDuplicates,
        },
        resultsPerKeyword
      ),
    [
      coreKeywords,
      generatedKeywords,
      longTailCount,
      minWords,
      maxTrafficRank,
      excludeGovEdu,
      mustContainImages,
      requireEmail,
      avoidDuplicates,
      resultsPerKeyword,
    ]
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 標題區 */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">
          搜尋條件設定 (Input)
        </h1>
        <p className="text-muted-foreground">
          設定自動抓取與初步過濾的規則。系統將根據這些設定每日自動執行。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左邊：條件設定 */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>關鍵字與搜尋來源</CardTitle>
              <CardDescription>
                定義系統要在哪些地方尋找內容
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 產業類別 */}
                <div className="space-y-2">
                  <Label htmlFor="industry">產業類別</Label>
                  <Select defaultValue={industry} onValueChange={setIndustry}>
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="travel">旅遊 / 住宿</SelectItem>
                      <SelectItem value="food">美食 / 餐廳</SelectItem>
                      <SelectItem value="tech">3C / 科技</SelectItem>
                      <SelectItem value="beauty">美妝 / 保養</SelectItem>
                      <SelectItem value="finance">理財 / 投資</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 語言 / 地區 */}
                <div className="space-y-2">
                  <Label htmlFor="lang">語言 / 地區</Label>
                  <Select
                    defaultValue={langRegion}
                    onValueChange={setLangRegion}
                  >
                    <SelectTrigger id="lang">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-tw">繁體中文 (台灣)</SelectItem>
                      <SelectItem value="en-us">English (US)</SelectItem>
                      <SelectItem value="ja-jp">日本語 (日本)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 核心關鍵字 + 長尾控制 */}
              <div className="space-y-2">
                <Label>核心關鍵字 (每行一個)</Label>
                <Textarea
                  value={coreKeywords}
                  onChange={(e) => setCoreKeywords(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      系統會依據核心關鍵字，利用 AI 產生建議的長尾關鍵字。
                    </span>
                    <div className="flex items-center gap-1">
                      <span>產生數量（每個核心關鍵字）</span>
                      <Select
                        value={longTailCount ? String(longTailCount) : "0"}
                        onValueChange={(v) => {
                          const n = Number(v);
                          if (!n || n <= 0) {
                            setLongTailCount(null);
                          } else {
                            setLongTailCount(Math.min(10, Math.max(1, n)));
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-[170px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">不用長尾關鍵字</SelectItem>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(
                            (n) => (
                              <SelectItem key={n} value={String(n)}>
                                每行 {n} 個
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateLongTailKeywords}
                    disabled={isGenerating || !longTailCount}
                    className="gap-1"
                  >
                    <SearchIcon className="w-4 h-4" />
                    {isGenerating ? "分析中..." : "用 AI 產生長尾關鍵字"}
                  </Button>
                </div>

                {/* 長尾關鍵字顯示區 */}
                <div className="mt-2 min-h-[40px] rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">
                  {isGenerating && "AI 正在分析長尾關鍵字..."}

                  {!isGenerating && generateError && (
                    <span className="text-red-500">
                      AI 產生長尾關鍵字失敗：{generateError}
                    </span>
                  )}

                  {!isGenerating &&
                    !generateError &&
                    generatedKeywords.length > 0 && (
                      <>
                        <div className="font-medium mb-1">
                          AI 產生的長尾關鍵字：
                        </div>
                        {generatedKeywords.map((k, idx) => (
                          <div key={idx}>• {k}</div>
                        ))}
                      </>
                    )}

                  {!isGenerating &&
                    !generateError &&
                    generatedKeywords.length === 0 &&
                    (longTailCount
                      ? "目前尚未產生長尾關鍵字。"
                      : "目前設定為「不用長尾關鍵字」。")}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 自動過濾規則 */}
          <Card>
            <CardHeader>
              <CardTitle>自動過濾規則 (Level 2 Filter)</CardTitle>
              <CardDescription>
                只有符合以下條件的內容才會進入人工審核階段
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 文章字數下限 */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>文章字數下限</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    {minWords} 字
                  </span>
                </div>
                <Slider
                  value={[minWords]}
                  max={3000}
                  step={100}
                  onValueChange={([v]) => setMinWords(v)}
                />
              </div>

              {/* 網站流量排名 */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>網站流量排名 (Alexa/SimilarWeb Global)</Label>
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    Top {maxTrafficRank.toLocaleString()}
                  </span>
                </div>
                <Slider
                  value={[maxTrafficRank]}
                  max={10_000_000}
                  step={100_000}
                  onValueChange={([v]) => setMaxTrafficRank(v)}
                />
              </div>

              {/* Switch 區域：4 個開關 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* 排除政府/學術網域 */}
                <div className="flex items-center justify-between border p-3 rounded-md">
                  <div className="space-y-0.5">
                    <Label className="text-base">排除政府/學術網域</Label>
                    <p className="text-xs text-muted-foreground">
                      排除 .gov, .edu 等非商業網站
                    </p>
                  </div>
                  <Switch
                    checked={excludeGovEdu}
                    onCheckedChange={setExcludeGovEdu}
                  />
                </div>

                {/* 必須包含圖片 */}
                <div className="flex items-center justify-between border p-3 rounded-md">
                  <div className="space-y-0.5">
                    <Label className="text-base">必須包含圖片</Label>
                    <p className="text-xs text-muted-foreground">
                      至少含有 3 張以上圖片
                    </p>
                  </div>
                  <Switch
                    checked={mustContainImages}
                    onCheckedChange={setMustContainImages}
                  />
                </div>

                {/* 🔹 必須找到 Email */}
                <div className="flex items-center justify-between border p-3 rounded-md">
                  <div className="space-y-0.5">
                    <Label className="text-base">必須找到 Email</Label>
                    <p className="text-xs text-muted-foreground">
                      只保留網頁內容中有 Email 的網站（會多一次抓取）
                    </p>
                  </div>
                  <Switch
                    checked={requireEmail}
                    onCheckedChange={setRequireEmail}
                  />
                </div>

                {/* 🔹 避免重複網域 */}
                <div className="flex items-center justify-between border p-3 rounded-md">
                  <div className="space-y-0.5">
                    <Label className="text-base">避免重複網域</Label>
                    <p className="text-xs text-muted-foreground">
                      同一個網域只保留一筆（包含歷史資料）
                    </p>
                  </div>
                  <Switch
                    checked={avoidDuplicates}
                    onCheckedChange={setAvoidDuplicates}
                  />
                </div>
              </div>

              {/* 排除關鍵字 */}
              <div className="space-y-2">
                <Label>排除關鍵字 (Negative Keywords)</Label>
                <Input
                  placeholder="賭博, 色情, 政治, 新聞稿..."
                  value={negativeKeywords}
                  onChange={(e) => setNegativeKeywords(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 border-t px-6 py-4 bg-muted/20">

            </CardFooter>
          </Card>
        </div>

        {/* 右側：預估產出＋API 配額 */}
        <div className="space-y-6">
          <Card className="bg-sidebar text-sidebar-foreground border-none">
            <CardHeader>
              <CardTitle className="text-sidebar-foreground">
                預估產出 (Preview)
              </CardTitle>
              <CardDescription className="text-sidebar-foreground/60">
                基於當前設定的每日預估量
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 每日抓取 URL */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">每日抓取 URL</span>
                  <span className="font-mono font-bold">
                    ~{preview.dailyUrls.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-full" />
                </div>
              </div>

              {/* 通過過濾器 */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">通過過濾器</span>
                  <span className="font-mono font-bold">
                    ~{preview.passedCount.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  {/* 用比例大概表示「剩下多少」 */}
                  <div
                    className="h-full bg-yellow-500"
                    style={{
                      width:
                        preview.dailyUrls > 0
                          ? `${Math.max(
                              2,
                              (preview.passedCount / preview.dailyUrls) * 100
                            )}%`
                          : "0%",
                    }}
                  />
                </div>
                <p className="text-xs opacity-50 pt-1">
                  過濾率: {preview.filterRate.toFixed(1)}% (
                  {preview.strictLevelLabel})
                </p>
              </div>

              {/* 系統建議（動態） */}
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 mt-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-yellow-400">
                  <RefreshCw className="w-4 h-4 animate-spin-slow" />
                  系統建議
                </div>
                <p className="text-xs leading-relaxed opacity-80">
                  {preview.suggestion}
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-sidebar-primary hover:bg-sidebar-primary/90 text-white gap-2"
                onClick={handleTestFetch}
                disabled={isTesting}
              >
                <SearchIcon className="w-4 h-4" />
                {isTesting ? "測試中..." : "立即執行測試抓取"}
              </Button>
            </CardFooter>
            {testError && (
              <p className="text-xs text-red-400 px-6 pb-4">{testError}</p>
            )}
              {testResponse && (
                <div className="px-6 pb-4">
                  <div className="text-sm font-medium mb-2">測試回傳（debug）</div>
                  <pre className="max-h-60 overflow-auto text-xs bg-slate-900 text-white p-3 rounded">
                    {JSON.stringify(testResponse, null, 2)}
                  </pre>
                </div>
              )}
          </Card>

          {/* API 配額使用（真實數字） */}
          <Card>
            <CardHeader>
              <CardTitle>API 配額使用</CardTitle>
              {usageLoading && (
                <p className="text-xs text-muted-foreground">讀取中...</p>
              )}
              {usageError && (
                <p className="text-xs text-red-500">
                  取得 API 使用量失敗：{usageError}
                </p>
              )}
              {usage?.lastUpdatedAt && (
                <p className="text-xs text-muted-foreground">
                  上次更新時間：
                  {new Date(usage.lastUpdatedAt).toLocaleString()}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* SerpAPI */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>SerpAPI 搜尋次數</span>
                  <span className="font-mono text-muted-foreground">
                    {serpUsed.toLocaleString()} /{" "}
                    {serpTotal ? serpTotal.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${serpPct}%` }}
                  />
                </div>
                {usage?.serpapi.totalSearchesLeft != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    本月剩餘：{" "}
                    <span className="font-mono">
                      {usage.serpapi.totalSearchesLeft.toLocaleString()}
                    </span>{" "}
                    次
                  </p>
                )}
              </div>

              {/* Gemini */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Gemini Token 使用量</span>
                  <span className="font-mono text-muted-foreground">
                    {gemUsed.toLocaleString()} /{" "}
                    {GEMINI_TOKEN_LIMIT.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${gemPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  呼叫次數：{usage?.gemini.calls ?? 0} 次
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 排程設定卡片 */}
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader>
              <CardTitle>排程設定 (Schedule)</CardTitle>
              <CardDescription>
                設定定期自動執行搜尋
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 排程名稱 */}
              <div className="space-y-2">
                <Label htmlFor="schedule-name">排程名稱</Label>
                <Input
                  id="schedule-name"
                  placeholder="例：每日美食排程"
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                />
              </div>

              {/* 開始日期 */}
              <div className="space-y-2">
                <Label htmlFor="schedule-start-date">開始日期</Label>
                <Input
                  id="schedule-start-date"
                  type="date"
                  value={scheduleStartDate ?? ""}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                />
              </div>

              {/* 執行頻率、週期、時間 */}
              <div className="grid grid-cols-3 gap-3">
                {/* 頻率 */}
                <div className="space-y-2">
                  <Label htmlFor="freq">執行頻率</Label>
                  <Select value={scheduleFrequency} onValueChange={setScheduleFrequency}>
                    <SelectTrigger id="freq" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">每日</SelectItem>
                      <SelectItem value="weekly">每週</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 週期選擇（週幾或日期） */}
                {scheduleFrequency === "weekly" && (
                  <div className="space-y-2">
                    <Label htmlFor="day-of-week">週幾</Label>
                    <Select value={String(scheduleDay)} onValueChange={(v) => setScheduleDay(Number(v))}>
                      <SelectTrigger id="day-of-week" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"].map((day, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scheduleFrequency === "monthly" && (
                  <div className="space-y-2">
                    <Label htmlFor="day-of-month">日期</Label>
                    <Select value={String(scheduleDay)} onValueChange={(v) => setScheduleDay(Number(v))}>
                      <SelectTrigger id="day-of-month" className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {day} 日
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scheduleFrequency === "daily" && (
                  <div className="space-y-2">
                    <Label htmlFor="hour">時間</Label>
                    <div className="flex gap-2">
                      <Select value={String(scheduleHour)} onValueChange={(v) => setScheduleHour(Number(v))}>
                        <SelectTrigger id="hour" className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={String(scheduleMinute)} onValueChange={(v) => setScheduleMinute(Number(v))}>
                        <SelectTrigger id="minute" className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {String(m).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* 時間選擇（非每日時） */}
                {(scheduleFrequency === "weekly" || scheduleFrequency === "monthly") && (
                  <div className="space-y-2">
                    <Label htmlFor="hour">執行時間</Label>
                    <div className="flex gap-2">
                      <Select value={String(scheduleHour)} onValueChange={(v) => setScheduleHour(Number(v))}>
                        <SelectTrigger id="hour" className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                            <SelectItem key={h} value={String(h)}>
                              {String(h).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={String(scheduleMinute)} onValueChange={(v) => setScheduleMinute(Number(v))}>
                        <SelectTrigger id="minute" className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {String(m).padStart(2, "0")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {saveError && (
                <p className="text-xs text-red-500">{saveError}</p>
              )}
            </CardContent>
          </Card>

          {/* 儲存並排程按鈕（放大，對齊紅框） */}
          <Button
            className="w-full text-lg py-6 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white"
            onClick={handleSaveAndSchedule}
            disabled={isSaving}
          >
            <Save className="w-5 h-5 mr-2" />
            {isSaving ? "保存中..." : "儲存並排程"}
          </Button>
        </div>
      </div>
    </div>
  );
}

