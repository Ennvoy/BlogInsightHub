import { useState, useEffect } from "react";
import { loadTemplates, saveTemplates, DEFAULT_TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Edit2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export default function SettingsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>(() => {
    try {
      const tpls = loadTemplates();
      return tpls;
    } catch (_e) {
      return DEFAULT_TEMPLATES.slice();
    }
  });

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EmailTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAdd = () => {
    setEditingId(null);
    setEditForm({
      id: Date.now().toString(),
      name: "",
      subject: "",
      body: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingId(template.id);
    setEditForm({ ...template });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!editForm || !editForm.name || !editForm.subject) {
      alert("請填寫範本名稱和主旨");
      return;
    }

    if (editingId) {
      // 編輯現有
      setTemplates(
        templates.map((t) => (t.id === editingId ? editForm : t))
      );
    } else {
      // 新增
      setTemplates([...templates, editForm]);
    }

    setIsDialogOpen(false);
    setEditForm(null);
  };

  const handleDelete = (id: string) => {
    if (confirm("確定要刪除此範本嗎？")) {
      setTemplates(templates.filter((t) => t.id !== id));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">系統設定</h1>
        <p className="text-muted-foreground">管理系統相關設置與信件範本</p>
      </div>

      {/* 信件範本管理 */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>開發信件範本</CardTitle>
              <CardDescription>
                在此管理與部落客溝通的信件模板，在人工審核頁面可快速使用
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAdd} className="gap-2">
                  <Plus className="w-4 h-4" />
                  新增範本
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? "編輯信件範本" : "新增信件範本"}
                  </DialogTitle>
                  <DialogDescription>
                    設定信件的主旨與內容。支持 [部落客名稱] 等變數。
                  </DialogDescription>
                </DialogHeader>

                {editForm && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="template-name">範本名稱</Label>
                      <Input
                        id="template-name"
                        placeholder="例：行銷邀約"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="template-subject">郵件主旨</Label>
                      <Input
                        id="template-subject"
                        placeholder="例：合作邀請 - [品牌名稱]"
                        value={editForm.subject}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            subject: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="template-body">郵件內容</Label>
                      <Textarea
                        id="template-body"
                        placeholder="在此輸入信件內容..."
                        value={editForm.body}
                        onChange={(e) =>
                          setEditForm({ ...editForm, body: e.target.value })
                        }
                        rows={10}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        支持的變數：[部落客名稱], [品牌名稱], [主題]
                      </p>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    取消
                  </Button>
                  <Button onClick={handleSave}>
                    {editingId ? "更新" : "建立"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-muted-foreground">
                    主旨：{template.subject}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    內容：{template.body}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {templates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                目前沒有信件範本。點擊「新增範本」開始建立。
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 其他設定區塊（預留） */}
      <Card>
        <CardHeader>
          <CardTitle>其他設定</CardTitle>
          <CardDescription>更多系統設置將在此新增</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">功能開發中...</p>
        </CardContent>
      </Card>
    </div>
  );
}
