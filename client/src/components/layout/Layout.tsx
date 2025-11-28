import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Search, 
  ListFilter, 
  CheckSquare, 
  Mail, 
  Settings, 
  BarChart3,
  Database,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems = [
    { href: "/", label: "總覽 Dashboard", icon: LayoutDashboard },
    { href: "/search", label: "搜尋條件 Input", icon: Search },
    { href: "/results", label: "搜尋結果 Results", icon: ListFilter },
    { href: "/review", label: "人工審核 Review", icon: CheckSquare },
    { href: "/collaboration", label: "合作追蹤 Collab", icon: Mail },
    { href: "/analytics", label: "排程管理 Schedule", icon: BarChart3 },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full text-sidebar-foreground">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <span>BloggerDev</span>
        </div>
        <p className="text-xs text-sidebar-foreground/60 mt-2 font-mono">v1.0.2 | System Ready</p>
      </div>

      <div className="flex-1 py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                }`}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="bg-sidebar-accent rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium">API Usage</span>
            <span className="text-sidebar-primary-foreground bg-sidebar-primary px-1.5 py-0.5 rounded text-[10px]">PRO</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] opacity-80">
              <span>SERP Queries</span>
              <span>842 / 1000</span>
            </div>
            <div className="h-1.5 bg-sidebar-foreground/10 rounded-full overflow-hidden">
              <div className="h-full bg-sidebar-primary w-[84%] rounded-full" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] opacity-80">
              <span>Analysis Tokens</span>
              <span>12.5k / 50k</span>
            </div>
            <div className="h-1.5 bg-sidebar-foreground/10 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 w-[25%] rounded-full" />
            </div>
          </div>
        </div>
        
        <button className="flex items-center gap-3 w-full px-3 py-2 mt-4 text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors">
          <Settings className="w-4 h-4" />
          系統設定
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 bg-sidebar border-r border-sidebar-border fixed inset-y-0 z-50">
        <NavContent />
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col md:ml-64 min-h-screen">
        <header className="md:hidden flex items-center justify-between p-4 border-b bg-sidebar text-sidebar-foreground">
          <div className="flex items-center gap-2 font-bold">
            <Database className="w-5 h-5" />
            <span>BloggerDev</span>
          </div>
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-sidebar border-r-sidebar-border w-64">
              <NavContent />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto bg-background">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}