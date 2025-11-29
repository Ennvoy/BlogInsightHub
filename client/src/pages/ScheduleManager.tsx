import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Play, Pause } from "lucide-react";
import { getSchedules, updateSchedule, deleteSchedule } from "@/lib/api";
import type { Schedule } from "@shared/schema";

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Schedule> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始加載排程
  useEffect(() => {
    const loadSchedules = async () => {
      try {
        setIsInitialLoading(true);
        const data = await getSchedules();
        setSchedules(data);
        setError(null);
      } catch (err: any) {
        console.error("加載排程失敗", err);
        setError(err.message || "加載失敗");
        // 暫時使用空列表，不用 fallback 的 mock 數據
        setSchedules([]);
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadSchedules();
  }, []);

  // 計算統計資訊
  const totalSchedules = schedules.length;
  const enabledSchedules = schedules.filter((s) => s.isEnabled).length;
  const disabledSchedules = totalSchedules - enabledSchedules;

  // 格式化時間
  const formatTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return "-";
    if (dateStr instanceof Date) {
      return dateStr.toLocaleString("zh-TW");
    }
    return new Date(dateStr).toLocaleString("zh-TW");
  };

  // 格式化頻率
  const formatFrequency = (freq: string, dayOfWeek?: number | null, dayOfMonth?: number | null) => {
    if (freq === "daily") return "每日";
    if (freq === "weekly") {
      const days = ["日", "一", "二", "三", "四", "五", "六"];
      return `每週${days[(dayOfWeek ?? 0) as number]}`;
    }
    if (freq === "monthly") return `每月 ${dayOfMonth ?? 1} 日`;
    return freq;
  };

  // 打開編輯表單
  const handleEdit = (schedule: Schedule) => {
    setEditingId(schedule.id);
    setFormData({ ...schedule });
  };

  // 保存編輯
  const handleSaveEdit = async () => {
    if (!editingId || !formData) return;
    setIsLoading(true);
    try {
      // 只更新可編輯的字段：hour, minute, frequency, dayOfWeek, dayOfMonth
      const updatePayload = {
        hour: formData.hour,
        minute: formData.minute,
        frequency: formData.frequency,
        dayOfWeek: formData.dayOfWeek,
        dayOfMonth: formData.dayOfMonth,
      };
      const updated = await updateSchedule(editingId, updatePayload);
      setSchedules(
        schedules.map((s) => (s.id === editingId ? updated : s))
      );
      setEditingId(null);
      setFormData(null);
      alert("排程已更新");
      // 變更儲存後重新整理頁面，以確保 UI 與後端狀態一致
      try {
        window.location.reload();
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      console.error("更新排程失敗", err);
      alert(err.message || "更新失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  // 刪除排程
  const handleDelete = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteSchedule(id);
      setSchedules(schedules.filter((s) => s.id !== id));
      setDeleteId(null);
      alert("排程已刪除");
    } catch (err: any) {
      console.error("刪除排程失敗", err);
      alert(err.message || "刪除失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  // 切換啟用/停用
  const handleToggle = async (id: string, enabled: boolean) => {
    setIsLoading(true);
    try {
      const updated = await updateSchedule(id, { isEnabled: enabled });
      setSchedules(
        schedules.map((s) => (s.id === id ? updated : s))
      );
    } catch (err: any) {
      console.error("切換排程狀態失敗", err);
      alert(err.message || "操作失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 標題區 */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">排程管理</h1>
        <p className="text-muted-foreground">
          管理並監控所有自動搜尋排程，查看執行狀態與歷史記錄
        </p>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              總排程數
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSchedules}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              啟用中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{enabledSchedules}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              已停用
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-500">{disabledSchedules}</div>
          </CardContent>
        </Card>
      </div>

      {/* 排程列表 */}
      <Card>
        <CardHeader>
          <CardTitle>排程列表</CardTitle>
          <CardDescription>
            點擊編輯按鈕修改排程設定，或使用切換按鈕啟用/停用排程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>頻率</TableHead>
                  <TableHead>執行時間</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>上次執行</TableHead>
                  <TableHead>下次執行</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">{schedule.name}</TableCell>
                    <TableCell>
                      {formatFrequency(
                        schedule.frequency,
                        schedule.dayOfWeek,
                        schedule.dayOfMonth
                      )}
                    </TableCell>
                    <TableCell>{String(schedule.hour).padStart(2, "0")}:{String(schedule.minute ?? 0).padStart(2, "0")}</TableCell>
                    <TableCell>
                      <Badge variant={schedule.isEnabled ? "default" : "secondary"}>
                        {schedule.isEnabled ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTime(schedule.lastRunAt)}
                      {schedule.lastRunStatus && (
                        <div className={`text-xs mt-1 ${
                          schedule.lastRunStatus === "success"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}>
                          {schedule.lastRunStatus === "success" ? "✓ 成功" : "✗ 失敗"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTime(schedule.nextRunAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggle(schedule.id, !schedule.isEnabled)}
                          disabled={isLoading}
                        >
                          {schedule.isEnabled ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(schedule)}
                          disabled={isLoading}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteId(schedule.id)}
                          disabled={isLoading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 編輯對話框 */}
      {editingId && formData && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle>編輯排程</CardTitle>
            <CardDescription>
              只可編輯執行時間與週期，搜尋設定為唯讀
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ========== 搜尋設定顯示區（唯讀） ========== */}
            {formData.searchConfig && (
              <div className="space-y-4 p-4 bg-white rounded-lg border border-blue-200">
                <h3 className="font-semibold text-lg">開課 & 搜尋來源</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">產業類別</Label>
                    <p className="text-sm font-medium">{formData.searchConfig.industry}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">語言 / 地區</Label>
                    <p className="text-sm font-medium">
                      {formData.searchConfig.language} ({formData.searchConfig.region})
                    </p>
                  </div>
                </div>

                {/* 核心關鍵字 */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">核心關鍵字（每行一個）</Label>
                  <div className="bg-muted p-3 rounded text-sm whitespace-pre-line max-h-24 overflow-y-auto">
                    {formData.coreKeywords?.join("\n") || "無"}
                  </div>
                </div>

                {/* 自動過濾規則 */}
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-semibold text-sm">自動過濾規則 (Level 2 Filter)</h4>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground text-xs">文章字數下限</Label>
                      <p className="font-medium">{formData.searchConfig.minWords} 字</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">網站流量排名</Label>
                      <p className="font-medium">
                        Top {formData.searchConfig.maxTrafficRank.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* 開關設定 */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center justify-between border p-2 rounded bg-white">
                      <span className="text-xs">排除政府/學術網域</span>
                      <Badge variant={formData.searchConfig.excludeGovEdu ? "default" : "secondary"}>
                        {formData.searchConfig.excludeGovEdu ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between border p-2 rounded bg-white">
                      <span className="text-xs">必須包含圖片</span>
                      <Badge variant={formData.searchConfig.requireImages ? "default" : "secondary"}>
                        {formData.searchConfig.requireImages ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between border p-2 rounded bg-white">
                      <span className="text-xs">必須找到 Email</span>
                      <Badge variant={formData.searchConfig.requireEmail ? "default" : "secondary"}>
                        {formData.searchConfig.requireEmail ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between border p-2 rounded bg-white">
                      <span className="text-xs">避免重複網域</span>
                      <Badge variant={formData.searchConfig.avoidDuplicates ? "default" : "secondary"}>
                        {formData.searchConfig.avoidDuplicates ? "✓" : "✗"}
                      </Badge>
                    </div>
                  </div>

                  {/* 排除關鍵字 */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">排除關鍵字 (Negative Keywords)</Label>
                    <div className="bg-muted p-2 rounded text-sm">
                      {formData.searchConfig.negativeKeywords?.join(", ") || "無"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========== 可編輯區域：執行時間與週期 ========== */}
            <div className="space-y-4 p-4 bg-white rounded-lg border border-green-200">
              <h3 className="font-semibold text-lg text-green-700">排程設定（可編輯）</h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>執行頻率</Label>
                  <Select
                    value={formData.frequency || "daily"}
                    onValueChange={(freq: any) =>
                      setFormData({ ...formData, frequency: freq })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">每日</SelectItem>
                      <SelectItem value="weekly">每週</SelectItem>
                      <SelectItem value="monthly">每月</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.frequency === "weekly" && (
                  <div className="space-y-2">
                    <Label>週幾</Label>
                    <Select
                      value={String(formData.dayOfWeek || 0)}
                      onValueChange={(v) =>
                        setFormData({ ...formData, dayOfWeek: Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"].map(
                          (day, idx) => (
                            <SelectItem key={idx} value={String(idx)}>
                              {day}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.frequency === "monthly" && (
                  <div className="space-y-2">
                    <Label>日期</Label>
                    <Select
                      value={String(formData.dayOfMonth || 1)}
                      onValueChange={(v) =>
                        setFormData({ ...formData, dayOfMonth: Number(v) })
                      }
                    >
                      <SelectTrigger>
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

                <div className="space-y-2">
                  <Label>執行時間</Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(formData.hour ?? 9)}
                      onValueChange={(v) => setFormData({ ...formData, hour: Number(v) })}
                    >
                      <SelectTrigger>
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

                    <Select
                      value={String(formData.minute ?? 0)}
                      onValueChange={(v) => setFormData({ ...formData, minute: Number(v) })}
                    >
                      <SelectTrigger>
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
              </div>

              <div className="space-y-2">
                <Label>備註</Label>
                <Input
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setFormData(null);
              }}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button onClick={handleSaveEdit} disabled={isLoading}>
              {isLoading ? "保存中..." : "保存變更"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* 刪除確認對話框 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>確認刪除排程？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作無法撤銷。刪除後，該排程將不再執行。
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              確認刪除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
