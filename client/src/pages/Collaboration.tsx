import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Phone, MessageSquare, MoreHorizontal, Calendar, CheckCircle2, Clock } from "lucide-react";

const contacts = [
  {
    id: 1,
    name: "Sarah Chen",
    blog: "TravelWithSarah",
    status: "negotiating",
    lastContact: "2 hours ago",
    email: "sarah@travel.com",
    avatar: "SC",
    stage: "報價階段",
    nextAction: "Follow up on rate card"
  },
  {
    id: 2,
    name: "David Wu",
    blog: "TechLifeDaily",
    status: "contacted",
    lastContact: "1 day ago",
    email: "david@techlife.com",
    avatar: "DW",
    stage: "已發送提案",
    nextAction: "Wait for reply"
  },
  {
    id: 3,
    name: "Emily Lin",
    blog: "TainanEats",
    status: "closed",
    lastContact: "3 days ago",
    email: "emily@tainan.com",
    avatar: "EL",
    stage: "合約簽署",
    nextAction: "Send content brief"
  },
  {
    id: 4,
    name: "Jason Wang",
    blog: "MoneySmart",
    status: "drafting",
    lastContact: "N/A",
    email: "jason@moneysmart.tw",
    avatar: "JW",
    stage: "草擬信件中",
    nextAction: "Approve email draft"
  }
];

export default function CollaborationPage() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">合作追蹤 (CRM)</h1>
          <p className="text-muted-foreground">管理與部落客的聯繫進度、報價與合約狀態。</p>
        </div>
        <Button>
          <Mail className="w-4 h-4 mr-2" />
          撰寫新開發信
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本週聯絡數</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">目標達成率 80%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均回覆率</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42%</div>
            <p className="text-xs text-muted-foreground">+5% 較上週</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">進行中談判</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">需優先處理</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月簽約</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">預估花費 $45,000</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">進行中 (Active)</TabsTrigger>
          <TabsTrigger value="pending">待處理 (Pending)</TabsTrigger>
          <TabsTrigger value="closed">已完成 (Closed)</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <div className="grid gap-4">
            {contacts.map((contact) => (
              <Card key={contact.id} className="overflow-hidden">
                <div className="flex items-center p-6 gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={`https://avatar.vercel.sh/${contact.name}`} />
                    <AvatarFallback>{contact.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 grid gap-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold leading-none">{contact.name}</h3>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Last update: {contact.lastContact}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{contact.blog}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={
                        contact.status === 'negotiating' ? 'default' : 
                        contact.status === 'contacted' ? 'secondary' : 
                        'outline'
                      }>
                        {contact.stage}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Next: {contact.nextAction}</span>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-muted/50 px-6 py-3 flex items-center gap-6 text-xs text-muted-foreground border-t">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3" />
                    {contact.email}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    +886 912 345 678
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="pending">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No pending items
          </div>
        </TabsContent>
        <TabsContent value="closed">
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No closed items
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}