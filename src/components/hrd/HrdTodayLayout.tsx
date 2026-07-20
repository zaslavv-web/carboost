import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import StudioRail from "@/components/hrd/StudioRail";
import FirstLoginModePicker from "@/components/hrd/FirstLoginModePicker";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Today-mode shell for canary HRD accounts. Replaces the full AppSidebar with a
 * compact studio rail; the canvas hosts the current route via <Outlet />.
 */
const HrdTodayLayout = () => {
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <ImpersonationBanner />
      <div className="flex flex-1 min-h-0">
        <StudioRail />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-12 bg-background/70 backdrop-blur-md border-b border-border/60 flex items-center justify-end px-3 md:px-6 gap-1">
            <ThemeToggle />
          </header>
          <main className="flex-1 p-4 md:p-8 overflow-auto">
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <FirstLoginModePicker onPick={() => { /* no-op: choice already persisted */ }} />
    </div>
  );
};

export default HrdTodayLayout;
