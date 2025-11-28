import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  ArrowUpDown,
  ExternalLink,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBloggerLeads,
  createBloggerLead,
  deleteBloggerLead,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ResultsPage() {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["blogger-leads"],
    queryFn: () => getBloggerLeads(100),
    refetchOnMount: "always", // 每次進頁面都重新抓一次
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBloggerLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogger-leads"] });
      toast({ title: "名單已刪除" });
    },
    onError: () => {
      toast({ title: "刪除失敗", variant: "destructive" });
    },
  });

  const addSampleLead = useMutation({
    mutationFn: () =>
      createBloggerLead({
        title: `測試文章 ${new Date().getTime()}`,
        url: `https://example.com/post-${new Date().getTime()}`,
        domain: "example.com",
        snippet: "這是一篇測試文章的摘要內容...",
        keywords: ["測試", "範例"],
        aiScore: Math.floor(Math.random() * 40) + 60,
        trafficEstimate: `${Math.floor(Math.random() * 100)}K/mo`,
        domainAuthority: Math.floor(Math.random() * 50) + 20,
        serpRank: `#${Math.floor(Math.random() * 10) + 1}`,
        contactEmail: "test@example.com",
        aiAnalysis: "這是 AI 自動生成的分析內容...",
        status: "pending_review",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogger-leads"] });
      toast({ title: "測試名單已新增" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(leads.map((l) => deleteBloggerLead(l.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blogger-leads"] });
      setConfirmOpen(false);
      toast({ title: "所有搜尋結果已清空" });
    },
    onError: () => {
      toast({ title: "清除失敗", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">載入中...</div>
    );
  }

  const sortedLeads = [...leads].sort((a, b) => {
    const diff = (a.aiScore ?? 0) - (b.aiScore ?? 0);
    return sortOrder === "asc" ? diff : -diff;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            搜尋結果 (Raw Data)
          </h1>
          <p className="text-muted-foreground">
            系統自動抓取並初步評分的原始名單池。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => addSampleLead.mutate()}
          >
            <Plus className="w-4 h-4" />
            新增測試資料
          </Button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                disabled={leads.length === 0 || clearAllMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
                全部清除
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>確認清除所有搜尋結果？</AlertDialogTitle>
                <AlertDialogDescription>
                  這個動作會刪除目前列表中的
                  <span className="font-semibold text-red-600">
                    {" "}
                    全部 {leads.length} 筆紀錄
                  </span>
                  ，且無法復原。之後需要重新執行搜尋流程才會產生新名單。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={clearAllMutation.isPending}>
                  否，取消
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  disabled={clearAllMutation.isPending}
                  onClick={() => clearAllMutation.mutate()}
                >
                  是，清空所有紀錄
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>名單列表</CardTitle>
              <CardDescription>共 {leads.length} 筆資料</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge
                variant="outline"
                className="bg-blue-50/50 text-blue-700 border-blue-200"
              >
                High: {leads.filter((l) => l.aiScore >= 90).length}
              </Badge>
              <Badge
                variant="outline"
                className="bg-yellow-50/50 text-yellow-700 border-yellow-200"
              >
                Medium: {
                  leads.filter(
                    (l) => l.aiScore >= 70 && l.aiScore < 90
                  ).length
                }
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>尚無資料。請先在「搜尋條件設定」頁面執行測試抓取，或使用「新增測試資料」。</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[360px]">標題 / 來源</TableHead>
                      <TableHead className="w-[120px] text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          <span>SERP 排名</span>
                        </div>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3 h-8"
                          onClick={() =>
                            setSortOrder(
                              sortOrder === "asc" ? "desc" : "asc"
                            )
                          }
                        >
                          AI 評分
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      </TableHead>
                      <TableHead>流量預估</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {sortedLeads.map((item) => (
                      <TableRow
                        key={item.id}
                        data-testid={`lead-row-${item.id}`}
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium line-clamp-1 hover:underline cursor-pointer">
                              {item.title}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                {item.domain}
                              </span>
                              <span>•</span>
                              <div className="flex gap-1">
                                {item.keywords.map((k: string) => (
                                  <span
                                    key={k}
                                    className="bg-muted px-1 rounded text-[10px]"
                                  >
                                    {k}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium bg-muted">
                            {item.serpRank || "N/A"}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold ${
                                item.aiScore >= 90
                                  ? "text-green-600"
                                  : item.aiScore >= 70
                                  ? "text-blue-600"
                                  : "text-orange-600"
                              }`}
                              data-testid={`score-${item.id}`}
                            >
                              {item.aiScore}
                            </span>
                            <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  item.aiScore >= 90
                                    ? "bg-green-500"
                                    : item.aiScore >= 70
                                    ? "bg-blue-500"
                                    : "bg-orange-500"
                                }`}
                                style={{ width: `${item.aiScore}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="font-mono text-xs">
                          {item.trafficEstimate || "N/A"}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`${
                              item.status === "approved"
                                ? "bg-green-100 text-green-800 hover:bg-green-100"
                                : ""
                            } ${
                              item.status === "rejected"
                                ? "bg-red-100 text-red-800 hover:bg-red-100"
                                : ""
                            } ${
                              item.status === "auto_filtered"
                                ? "bg-gray-100 text-gray-800 hover:bg-gray-100"
                                : ""
                            }`}
                          >
                            {item.status === "pending_review"
                              ? "待審核"
                              : item.status === "approved"
                              ? "已核准"
                              : item.status === "rejected"
                              ? "已拒絕"
                              : "已過濾"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                data-testid={`menu-${item.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>操作</DropdownMenuLabel>
                              <DropdownMenuItem>查看詳細分析</DropdownMenuItem>
                              <DropdownMenuItem>移至審核區</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() =>
                                  deleteMutation.mutate(item.id)
                                }
                                data-testid={`delete-${item.id}`}
                              >
                                刪除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-end space-x-2 py-4">
                <Button variant="outline" size="sm">
                  Previous
                </Button>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
