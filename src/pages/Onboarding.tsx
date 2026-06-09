import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Building2, Briefcase, Users, Settings as SettingsIcon, CheckCircle2, ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Step {
  key: string;
  title: string;
  description: string;
  icon: any;
  done: boolean;
  cta: string;
  path: string;
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");
  const companyId = profile?.company_id;

  const { data: counts } = useQuery({
    queryKey: ["onboarding_counts", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const [pos, emp, tracks, tests, products] = await Promise.all([
        laravelDb.from("positions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        laravelDb.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        laravelDb.from("career_track_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        laravelDb.from("closed_question_tests").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        laravelDb.from("shop_products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);
      return {
        positions: pos.count ?? 0,
        employees: emp.count ?? 0,
        tracks: tracks.count ?? 0,
        tests: tests.count ?? 0,
        products: products.count ?? 0,
      };
    },
    enabled: !!companyId,
  });

  const { data: settings } = useQuery({
    queryKey: ["onboarding_settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await laravelDb
        .from("company_onboarding_settings" as any)
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!companyId,
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!companyId) return;
      const { error } = await laravelDb
        .from("company_onboarding_settings" as any)
        .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("onboarding.toastSaved"));
      queryClient.invalidateQueries({ queryKey: ["onboarding_settings", companyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const steps: Step[] = [
    {
      key: "positions",
      title: t("onboarding.stepPositionsTitle"),
      description: t("onboarding.stepPositionsDesc"),
      icon: Briefcase,
      done: (counts?.positions ?? 0) > 0,
      cta: t("onboarding.stepPositionsCta"),
      path: "/positions",
    },
    {
      key: "tests",
      title: t("onboarding.stepTestsTitle"),
      description: t("onboarding.stepTestsDesc"),
      icon: SettingsIcon,
      done: (counts?.tests ?? 0) > 0,
      cta: t("onboarding.stepTestsCta"),
      path: "/tests",
    },
    {
      key: "tracks",
      title: t("onboarding.stepTracksTitle"),
      description: t("onboarding.stepTracksDesc"),
      icon: ArrowRight,
      done: (counts?.tracks ?? 0) > 0,
      cta: t("onboarding.stepTracksCta"),
      path: "/career-tracks-mgmt",
    },
    {
      key: "shop",
      title: t("onboarding.stepShopTitle"),
      description: t("onboarding.stepShopDesc"),
      icon: Coins,
      done: (counts?.products ?? 0) > 0,
      cta: t("onboarding.stepShopCta"),
      path: "/shop-admin",
    },
    {
      key: "employees",
      title: t("onboarding.stepEmployeesTitle"),
      description: t("onboarding.stepEmployeesDesc"),
      icon: Users,
      done: (counts?.employees ?? 1) > 1,
      cta: t("onboarding.stepEmployeesCta"),
      path: "/invitations",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const progress = Math.round((completed / steps.length) * 100);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("onboarding.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("onboarding.subtitle")}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground">
            {t("onboarding.progressLabel", { completed, total: steps.length })}
          </p>
          <p className="text-sm font-bold text-primary">{progress}%</p>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`bg-card rounded-xl border p-5 ${s.done ? "border-success/40" : "border-border"}`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  s.done ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                }`}
              >
                {s.done ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
              </div>
            </div>
            <Button
              variant={s.done ? "outline" : "default"}
              size="sm"
              onClick={() => navigate(s.path)}
              className="w-full"
            >
              {s.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">{t("onboarding.automationTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("onboarding.automationSubtitle")}</p>
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-medium text-foreground">{t("onboarding.autoTestsLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("onboarding.autoTestsDesc")}</p>
          </div>
          <input
            type="checkbox"
            checked={settings?.auto_assign_tests ?? true}
            onChange={(e) => updateSettings.mutate({ auto_assign_tests: e.target.checked })}
            className="w-5 h-5 accent-primary"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-medium text-foreground">{t("onboarding.autoTracksLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("onboarding.autoTracksDesc")}</p>
          </div>
          <input
            type="checkbox"
            checked={settings?.auto_assign_tracks ?? true}
            onChange={(e) => updateSettings.mutate({ auto_assign_tracks: e.target.checked })}
            className="w-5 h-5 accent-primary"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="text-sm font-medium text-foreground">{t("onboarding.welcomeBonusLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("onboarding.welcomeBonusDesc")}</p>
          </div>
          <input
            type="checkbox"
            checked={settings?.welcome_bonus_enabled ?? true}
            onChange={(e) => updateSettings.mutate({ welcome_bonus_enabled: e.target.checked })}
            className="w-5 h-5 accent-primary"
          />
        </label>

        {settings?.welcome_bonus_enabled !== false && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{t("onboarding.bonusAmountLabel")}</p>
            <input
              type="number"
              min={0}
              defaultValue={settings?.welcome_bonus_amount ?? 100}
              onBlur={(e) => updateSettings.mutate({ welcome_bonus_amount: Number(e.target.value) || 0 })}
              className="w-32 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
