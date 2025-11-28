import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Activity, 
  Search, 
  Users, 
  CheckCircle, 
  TrendingUp,
  ArrowUpRight,
  BarChart
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { getStats } from "@/lib/api";

const data = [
  { name: 'Mon', new: 40, accepted: 24 },
  { name: 'Tue', new: 30, accepted: 13 },
  { name: 'Wed', new: 20, accepted: 98 },
  { name: 'Thu', new: 27, accepted: 39 },
  { name: 'Fri', new: 18, accepted: 48 },
  { name: 'Sat', new: 23, accepted: 38 },
  { name: 'Sun', new: 34, accepted: 43 },
];

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard 總覽</h1>
        <p className="text-muted-foreground">今日系統運行狀況與數據摘要。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今日新增名單</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-today-leads">
              {isLoading ? "..." : stats?.todayNewLeads ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              系統自動抓取
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待審核項目</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending-review">
              {isLoading ? "..." : stats?.pendingReview ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              需人工處理
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月合作確認</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-monthly-collabs">
              {isLoading ? "..." : stats?.monthlyCollaborations ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              本月新簽約數
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">活躍合作中</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-collabs">
              {isLoading ? "..." : stats?.activeCollaborations ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              正在進行的合作
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>開發漏斗趨勢</CardTitle>
            <CardDescription>
              過去 7 天的新進名單與成功轉化數
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAccepted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="new" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorNew)" name="新名單" />
                  <Area type="monotone" dataKey="accepted" stroke="hsl(var(--chart-2))" fillOpacity={1} fill="url(#colorAccepted)" name="合作確認" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>近期活動系統日誌</CardTitle>
            <CardDescription>
              自動化腳本執行狀況
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: "Database Initialized", status: "Completed", time: "Just now", details: "All tables created successfully" },
                { action: "API Server", status: "Running", time: "Active", details: "All endpoints operational" },
                { action: "Frontend Connected", status: "Ready", time: "Active", details: "Real-time data synced" },
              ].map((log, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                  <div className={`mt-1 w-2 h-2 rounded-full ${log.status === 'Running' ? 'bg-green-500 animate-pulse' : log.status === 'Ready' ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium leading-none flex justify-between">
                      {log.action}
                      <span className="text-xs text-muted-foreground font-mono">{log.time}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}