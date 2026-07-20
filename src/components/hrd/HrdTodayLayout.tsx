import { Outlet, useLocation, NavLink } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import StudioRail from "@/components/hrd/StudioRail";
import FirstLoginModePicker from "@/components/hrd/FirstLoginModePicker";
import ThemeToggle from "@/components/ThemeToggle";
import { getActiveStudioLabel } from "@/lib/hrdStudios";

/**
 * Today-mode shell для canary HRD. Слева — компактный рейл, в шапке слева —
 * крошка «← Today · <студия>», которая появляется, когда пользователь ушёл
 * со главного экрана.
 */
const HrdTodayLayout = () => {
  const location = useLocation();
  const studioLabel = getActiveStudioLabel(location.pathname);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <ImpersonationBanner />
      <div className="flex flex-1 min-h-0">
        <StudioRail />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-12 bg-background/70 backdrop-blur-md border-b border-border/60 flex items-center justify-between px-3 md:px-6 gap-2">
            <div className="min-w-0 flex items-center">
              {studioLabel && (
                <NavLink
                  to="/today"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="font-medium text-foreground">Today</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="truncate">{studioLabel}</span>
                </NavLink>
              )}
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
            </div>
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
