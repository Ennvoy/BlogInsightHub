import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  BarChart2,
  Globe,
  History,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { loadTemplates } from "@/lib/templates";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBloggerLeads, updateBloggerLead } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type ReviewDecisionInput = {
  leadId: string;
  decision: "yes" | "no";
  notes?: string | null;
};

type BloggerLead = {
  id: string;
  domain?: string;
  url?: string;
  title?: string;
  keywords?: string[];
  snippet?: string | null;
  serpRank?: number | string | null;
  aiScore?: number | null;
  aiAnalysis?: string | null;
  contactEmail?: string | null;
  activityStatus?: string | null;
  lastUpdatedAt?: string | null;
  bloggerName?: string | null;
};

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const [selectedEmailTemplateIdx, setSelectedEmailTemplateIdx] = useState(0);
  const [emailTemplates, setEmailTemplates] = useState(() => {
    try {
      return loadTemplates();
    } catch (e) {
      console.error("loadTemplates failed", e);
      return [];
    }
  });

  /**
   * 當 templates 數量變動時，確保選中 index 不會超出範圍
   * 以及監聽外部 template 變更事件（localStorage / custom event）
   * 注意：hooks 必須在所有早期 return 之前宣告，避免 "Rendered more hooks" 錯誤
   */
  useEffect(() => {
    if (emailTemplates.length === 0) return;
    if (selectedEmailTemplateIdx >= emailTemplates.length) {
      setSelectedEmailTemplateIdx(emailTemplates.length - 1);
    }
  }, [emailTemplates, selectedEmailTemplateIdx]);

  useEffect(() => {
    const onUpdated = (e: any) => {
      try {
        const tpls = e?.detail ?? loadTemplates();
        setEmailTemplates(tpls);
      } catch (err) {
        setEmailTemplates(loadTemplates());
      }
    };

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "bi_email_templates") {
        setEmailTemplates(loadTemplates());
      }
    };

    window.addEventListener("bi:templates:updated", onUpdated as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("bi:templates:updated", onUpdated as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // 只抓待審核的名單
  const { data: allLeads = [], isLoading } = useQuery<BloggerLead[]>({
    queryKey: ["blogger-leads", "pending_review"],
    queryFn: () => getBloggerLeads(100, "pending_review"),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ leadId, decision }: ReviewDecisionInput) => {
      const status = decision === "yes" ? "approved" : "rejected";
      return updateBloggerLead(leadId, { status });
    },
    onSuccess: (_data, variables) => {
      let newLength = 0;

      queryClient.setQueryData(
        ["blogger-leads", "pending_review"],
        (old: any) => {
          if (!old) return old;
          const list = old.filter((l: any) => l.id !== variables.leadId);
          newLength = list.length;
          return list;
        }
      );

      setCurrentIndex((prev) =>
        newLength === 0 ? 0 : Math.min(prev, newLength - 1)
      );

      queryClient.invalidateQueries({ queryKey: ["blogger-leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });

      toast({
        title:
          variables.decision === "yes"
            ? "✅ 已標記為合作對象"
            : "❌ 已略過",
        description: "決定已記錄",
      });

      setDirection(0);
    },
    onError: (err: any) => {
      toast({
        title: "操作失敗",
        description: err?.message ?? "請查看 Console / Network",
        variant: "destructive",
      });
      setDirection(0);
    },
  });

  const handleDecision = (decision: "yes" | "no") => {
    const currentLead = allLeads[currentIndex];
    if (!currentLead) return;

    setDirection(decision === "yes" ? 1 : -1);

    reviewMutation.mutate({
      leadId: currentLead.id,
      decision,
      notes: null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        載入中...
      </div>
    );
  }

  // 全部審完
  if (allLeads.length === 0) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <ThumbsUp className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold">全部審核完畢！</h2>
          <p className="text-muted-foreground">目前沒有待審核的項目。</p>
          <Button onClick={() => (window.location.href = "/results")}>
            前往結果頁面
          </Button>
        </div>
      </div>
    );
  }

  const currentItem = allLeads[currentIndex];

  const activityStatus = currentItem?.activityStatus || "Unknown";
  const lastUpdatedAt = currentItem?.lastUpdatedAt ?? null;
  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.slice(0, 10)
    : "未知";

  const remaining = allLeads.length;


  const renderTemplateText = (text?: string) => {
    if (!text) return "";
    return text
      .replace(/{bloggerName}/g, currentItem.bloggerName || "部落客")
      .replace(/{topic}/g, currentItem.title || "主題")
      .replace(/{domain}/g, currentItem.domain || "")
      .replace(/{contactEmail}/g, currentItem.contactEmail || "");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40">
      {/* 標題區 */}
      <div className="flex flex-col items-center text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">人工審核 (Rapid Review)</h1>
        <p className="text-muted-foreground">
          快速篩選高潛力名單。YES 進入開發流程, NO 直接歸檔。
        </p>
        <div className="flex items-center gap-2 text-sm font-medium bg-muted px-3 py-1 rounded-full mt-2">
          <Clock className="w-3 h-3" />
          <span data-testid="remaining-count">剩餘待審: {remaining} 筆</span>
        </div>
      </div>

      {/* 主卡片 */}
      <div className="relative h-[600px] w-full flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentItem.id}
            initial={{
              opacity: 0,
              x: direction === 0 ? 0 : direction > 0 ? 100 : -100,
              scale: 0.95,
            }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: direction > 0 ? 200 : -200,
              rotate: direction > 0 ? 10 : -10,
            }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-2xl absolute"
            data-testid={`review-card-${currentItem.id}`}
          >
            <Card className="h-full shadow-2xl border-2 border-border/50 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500" />

              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs font-normal">
                        {currentItem.domain}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl leading-tight">
                      <a
                        href={currentItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline hover:text-primary flex items-center gap-2"
                      >
                        {currentItem.title}
                        <ExternalLink className="w-4 h-4 opacity-50" />
                      </a>
                    </CardTitle>
                  </div>
                </div>

                {/* Tags */}
                <div className="flex gap-2 pt-2 flex-wrap">
                  {(currentItem.keywords || []).map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="rounded-md">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pb-36">
                {/* Snippet */}
                {currentItem.snippet && (
                  <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed border border-border/50 italic text-muted-foreground">
                    "{currentItem.snippet}"
                  </div>
                )}

                {/* 指標 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border text-center space-y-1">
                    <Globe className="w-5 h-5 mx-auto text-blue-500" />
                    <div className="text-lg font-bold">
                      {currentItem.serpRank || "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">SerpAPI 排名</div>
                  </div>

                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border text-center space-y-1">
                    <BarChart2 className="w-5 h-5 mx-auto text-purple-500" />
                    <div className="text-lg font-bold">
                      {currentItem.aiScore ?? "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">AI 評分</div>
                  </div>

                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border text-center space-y-1">
                    <History className="w-5 h-5 mx-auto text-green-500" />
                    <div className="text-lg font-bold">{activityStatus}</div>
                    <div className="text-xs text-muted-foreground">
                      更新頻率 · {lastUpdatedLabel}
                    </div>
                  </div>
                </div>

                {/* AI 分析 */}
                {currentItem.aiAnalysis && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      AI 分析建議
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {currentItem.aiAnalysis}
                    </p>
                  </div>
                )}

                {/* 信件模板 */}
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-medium">開發信件模板</h4>

                  <div className="p-2 border rounded-md inline-block">
                    <div className="flex gap-2 flex-wrap">
                      {emailTemplates.map((tpl, idx) => (
                        <Badge
                          key={tpl.id}
                          variant={
                            selectedEmailTemplateIdx === idx ? "default" : "outline"
                          }
                          className="cursor-pointer"
                          onClick={() => setSelectedEmailTemplateIdx(idx)}
                        >
                          {tpl.name}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* 收件者 */}
                  <div className="space-y-2 pt-2">
                    <div className="text-xs text-muted-foreground">收件者</div>
                    <div className="p-2 bg-muted/50 rounded text-sm">
                      {currentItem.contactEmail || "Not Found"}
                    </div>
                  </div>

                  {/* 主旨 */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">主旨</div>
                    <div className="p-2 bg-muted/50 rounded text-sm font-medium">
                      {emailTemplates.length > 0
                        ? renderTemplateText(
                            emailTemplates[selectedEmailTemplateIdx]?.subject
                          )
                        : ""}
                    </div>
                  </div>

                  {/* 信件內容 */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">信件內容</div>
                    <div className="p-3 bg-muted/30 rounded text-sm leading-relaxed border whitespace-pre-wrap min-h-[180px] max-h-[240px] overflow-y-auto">
                      {emailTemplates.length > 0
                        ? renderTemplateText(
                            emailTemplates[selectedEmailTemplateIdx]?.body
                          )
                        : ""}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="text-xs text-muted-foreground border-t pt-4 flex justify-between mt-4">
                  <span>Contact: {currentItem.contactEmail || "Not Found"}</span>
                  <span>ID: #{currentItem.id.slice(0, 8)}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 按鈕 */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 z-50 px-4 pointer-events-none">
        <Button
          size="lg"
          variant="outline"
          className="h-16 w-32 rounded-full 
            bg-red-50 text-red-700 
            border-2 border-red-200
            hover:bg-red-100 hover:border-red-300 hover:text-red-800
            shadow-lg pointer-events-auto transition-all"
          onClick={() => handleDecision("no")}
          disabled={reviewMutation.isPending}
        >
          <ThumbsDown className="w-6 h-6 mr-2" />
          略過
        </Button>

        <Button
          size="lg"
          className="h-16 w-32 rounded-full bg-primary hover:bg-primary/90 shadow-lg pointer-events-auto transition-all"
          onClick={() => handleDecision("yes")}
          disabled={reviewMutation.isPending}
        >
          <ThumbsUp className="w-6 h-6 mr-2" />
          合作
        </Button>
      </div>
    </div>
  );
}
