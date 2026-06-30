/**
 * BrandingContext — загружает фирменный стиль компании (логотип + основной
 * акцентный цвет) и применяет его к интерфейсу через CSS-переменные на
 * `<html>`. Работает поверх ThemeContext (light/dark): значения переписываются
 * каждый раз при смене темы, дефолты остаются в index.css.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTheme } from "@/contexts/ThemeContext";
import {
  darken,
  getReadableForegroundVar,
  hslToVar,
  lighten,
  varToHsl,
} from "@/lib/color";

export interface CompanyBranding {
  company_id: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  primary_hsl: string | null;
  primary_glow_hsl: string | null;
  accent_hsl: string | null;
  sidebar_bg_hsl: string | null;
  auto_extracted?: boolean;
}

interface BrandingContextValue {
  branding: CompanyBranding | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
  /** Текущий логотип с учётом темы (или null, если бренд не задан). */
  activeLogoUrl: string | null;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

const VAR_KEYS = [
  "--primary",
  "--primary-foreground",
  "--primary-glow",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--accent",
  "--accent-foreground",
  "--gradient-primary",
  "--shadow-elevated",
  "--shadow-glow",
] as const;

function clearBrandingVars() {
  const root = document.documentElement;
  VAR_KEYS.forEach((k) => root.style.removeProperty(k));
}

function applyBrandingVars(b: CompanyBranding, theme: "light" | "dark") {
  const root = document.documentElement;
  const primary = varToHsl(b.primary_hsl);
  if (!primary) {
    clearBrandingVars();
    return;
  }
  const glow = varToHsl(b.primary_glow_hsl) ?? lighten(primary, 12);
  const accent = varToHsl(b.accent_hsl);

  const primaryVar = hslToVar(primary);
  const glowVar = hslToVar(glow);
  const fgVar = getReadableForegroundVar(primary);

  root.style.setProperty("--primary", primaryVar);
  root.style.setProperty("--primary-foreground", fgVar);
  root.style.setProperty("--primary-glow", glowVar);
  root.style.setProperty("--ring", primaryVar);
  root.style.setProperty("--sidebar-primary", primaryVar);
  root.style.setProperty("--sidebar-primary-foreground", fgVar);
  root.style.setProperty("--sidebar-ring", primaryVar);

  if (accent) {
    // В тёмной теме мягче, в светлой — заметнее.
    const accentTuned = theme === "dark" ? darken(accent, 5) : lighten(accent, 5);
    root.style.setProperty("--accent", hslToVar(accentTuned));
    root.style.setProperty("--accent-foreground", getReadableForegroundVar(accentTuned));
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
  }

  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, hsl(${primaryVar}), hsl(${glowVar}))`,
  );
  root.style.setProperty(
    "--shadow-elevated",
    `0 10px 30px -10px hsl(${primaryVar} / 0.25), 0 8px 12px -6px hsl(220 11% 19% / 0.08)`,
  );
  root.style.setProperty("--shadow-glow", `0 0 40px hsl(${primaryVar} / 0.3)`);
}

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const { authReady, user } = useAuth();
  const { data: profile } = useUserProfile();
  const { theme } = useTheme();
  const qc = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ["company-branding", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await laravel.get<CompanyBranding>(
        `/companies/${companyId}/branding`,
      );
      if (error) {
        // 403/404 на брендинге — не критично, просто остаёмся без кастома.
        return null;
      }
      return data;
    },
    enabled: authReady && !!user && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const branding = query.data ?? null;

  useEffect(() => {
    if (branding) {
      applyBrandingVars(branding, theme);
    } else {
      clearBrandingVars();
    }
  }, [branding, theme]);

  // На размонтировании / выходе — снимаем переменные, чтобы лендинг и логин
  // не показывали чужой бренд.
  useEffect(() => {
    if (!companyId) clearBrandingVars();
  }, [companyId]);

  const refetch = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["company-branding", companyId] });
  }, [qc, companyId]);

  const activeLogoUrl = useMemo(() => {
    if (!branding) return null;
    if (theme === "dark" && branding.logo_dark_url) return branding.logo_dark_url;
    return branding.logo_url ?? null;
  }, [branding, theme]);

  return (
    <BrandingContext.Provider
      value={{ branding, isLoading: query.isLoading, refetch, activeLogoUrl }}
    >
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = (): BrandingContextValue => {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    // Provider может ещё не быть подключён (на лендинге/логине) — отдаём пусто.
    return { branding: null, isLoading: false, refetch: async () => {}, activeLogoUrl: null };
  }
  return ctx;
};
