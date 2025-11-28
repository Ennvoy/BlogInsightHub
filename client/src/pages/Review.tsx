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
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getBloggerLeads, updateBloggerLead } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type ReviewDecisionInput = {
  leadId: string;
  decision: "yes" | "no";
  notes?: string | null;
};

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // 只抓待審核的名單
  const { data: allLeads = [], isLoading } = useQuery({
    queryKey: ["blogger-leads", "pending_review"],
    queryFn: () => getBloggerLeads(100, "pending_review"),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ leadId, decision }: ReviewDecisionInput) => {
      const status = decision === "yes" ? "approved" : "rejected";
      return updateBloggerLead(leadId, { status });
    },
    onSuccess: (_data, variables) => {
      // 1) 從 pending_review 名單中移除這一筆
      let newLength = 0;
      queryClient.setQueryData(
        ["blogger-leads", "pending_review"],
        (old: any) => {
          if (!old) {
            newLength = 0;
            return old;
          }
          const list = (old as any[]).filter(
            (l) => l.id !== variables.leadId
          );
          newLength = list.length;
          return list;
        }
      );

      // 2) 調整 currentIndex：確保不超出範圍
      setCurrentIndex((prev) =>
        newLength === 0 ? 0 : Math.min(prev, newLength - 1)
      );

      // 3) 其他頁面（結果 / 統計）可以重刷
      queryClient.invalidateQueries({ queryKey: ["blogger-leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });

      toast({
        title:
          variables.decision === "yes"
            ? "✅ 已標記為合作對象"
            : "❌ 已略過",
        description: "決定已記錄",
      });

      // 把動畫方向歸零
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

    // 先設定離場方向，給 framer-motion 用
    setDirection(decision === "yes" ? 1 : -1);

    reviewMutation.mutate({
      leadId: currentLead.id,
      decision,
      notes: null,
    });
    // 不再手動改 currentIndex，交給 onSuccess 依照新列表處理
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        載入中...
      </div>
    );
  }

  // ⚠ 一定要在取 currentItem 之前就處理「全部審完」的狀況
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

  // 到這裡保證 allLeads 至少有 1 筆
  const currentItem = allLeads[currentIndex];

  const activityStatus =
    (currentItem as any)?.activityStatus || "Unknown";
  const lastUpdatedAt =
    ((currentItem as any)?.lastUpdatedAt as
      | string
      | null
      | undefined) ?? null;
  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.slice(0, 10)
    : "未知";

  const remaining = allLeads.length; // 已經是「剩餘待審」的筆數（包含目前這一筆）

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col items-center text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          人工審核 (Rapid Review)
        </h1>
        <p className="text-muted-foreground">
          快速篩選高潛力名單。YES 進入開發流程, NO 直接歸檔。
        </p>
        <div className="flex items-center gap-2 text-sm font-medium bg-muted px-3 py-1 rounded-full mt-2">
          <Clock className="w-3 h-3" />
          <span data-testid="remaining-count">
            剩餘待審: {remaining} 筆
          </span>
        </div>
      </div>

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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        {currentItem.domain}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {currentItem.serpRank || "N/A"} on Google
                      </span>
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
                  <div className="flex flex-col items-end">
                    <div
                      className="text-3xl font-bold text-primary"
                      data-testid="current-score"
                    >
                      {currentItem.aiScore}
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      AI Score
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 flex-wrap">
                  {(currentItem.keywords || []).map((tag) => (
                    <Badge key={tag} variant="secondary" className="rounded-md">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {currentItem.snippet && (
                  <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed border border-border/50 italic text-muted-foreground">
                    "{currentItem.snippet}"
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 text-center space-y-1">
                    <Globe className="w-5 h-5 mx-auto text-blue-500" />
                    <div className="text-lg font-bold">
                      {currentItem.trafficEstimate || "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      月流量估算
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/50 text-center space-y-1">
                    <BarChart2 className="w-5 h-5 mx-auto text-purple-500" />
                    <div className="text-lg font-bold">
                      {currentItem.domainAuthority ?? "N/A"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      網域權重 DA
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/50 text-center space-y-1">
                    <History className="w-5 h-5 mx-auto text-green-500" />
                    <div className="text-lg font-bold">
                      {activityStatus}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      更新頻率 · {lastUpdatedLabel}
                    </div>
                  </div>
                </div>

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

                <div className="text-xs text-muted-foreground border-t pt-4 flex justify-between">
                  <span>
                    Contact: {currentItem.contactEmail || "Not Found"}
                  </span>
                  <span>ID: #{currentItem.id.slice(0, 8)}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 z-50 px-4 pointer-events-none">
        <Button
          size="lg"
          variant="outline"
          className="h-16 w-32 rounded-full border-2 border-red-200 hover:bg-red-50 hover:text-red-600 hover:border-red-300 shadow-lg pointer-events-auto transition-all"
          onClick={() => handleDecision("no")}
          disabled={reviewMutation.isPending}
          data-testid="button-reject"
        >
          <ThumbsDown className="w-6 h-6 mr-2" />
          略過
        </Button>
        <Button
          size="lg"
          className="h-16 w-32 rounded-full bg-primary hover:bg-primary/90 shadow-lg pointer-events-auto transition-all"
          onClick={() => handleDecision("yes")}
          disabled={reviewMutation.isPending}
          data-testid="button-approve"
        >
          <ThumbsUp className="w-6 h-6 mr-2" />
          合作
        </Button>
      </div>
    </div>
  );
}
