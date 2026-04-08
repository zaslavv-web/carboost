import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { Bell, Search } from "lucide-react";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-[260px] transition-all duration-300">
        {/* Header */}
        <header className="sticky top-0 z-40 h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск..."
              className="pl-10 pr-4 py-2 w-72 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                АИ
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground">Алексей Иванов</p>
                <p className="text-muted-foreground text-xs">Старший инженер</p>
              </div>
            </div>
          </div>
        </header>
        {/* Content */}
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
