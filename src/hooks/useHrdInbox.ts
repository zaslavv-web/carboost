import { useQuery } from "@tanstack/react-query";
import { leavesApi } from "@/integrations/laravel/leaves";
import { probationApi } from "@/integrations/laravel/performance";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile } from "@/hooks/useUserProfile";

export type InboxKind = "leave" | "probation_overdue" | "risk";
export type InboxSeverity = "high" | "medium" | "low";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  severity: InboxSeverity;
  title: string;
  subtitle?: string;
  actorName?: string;
  dueAt?: string | null;
  /** Source record — used by cards to build actions/deep-links. */
  raw: unknown;
}

const severityRank: Record<InboxSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Aggregates the HRD inbox from existing endpoints — pending HR leave
 * approvals, overdue probations, and high-risk employees. Read-only:
 * mutations happen from the cards through their own APIs.
 */
export const useHrdInbox = () => {
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id ?? null;

  const leavesQ = useQuery({
    queryKey: ["hrd-inbox", "leaves", companyId],
    queryFn: async () => {
      const list = await leavesApi.listRequests("inbox", "pending_hr");
      return list ?? [];
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const probationsQ = useQuery({
    queryKey: ["hrd-inbox", "probations", companyId],
    queryFn: async () => {
      const list = await probationApi.list({ status: "active" });
      return list ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const risksQ = useQuery({
    queryKey: ["hrd-inbox", "risks", companyId],
    queryFn: async () => {
      if (!companyId) return [] as any[];
      const { data, error } = await laravelDb
        .from("employee_risk_scores")
        .select("*")
        .eq("company_id", companyId)
        .eq("risk_level", "high");
      if (error) return [];
      return (data ?? []) as any[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const now = Date.now();

  const items: InboxItem[] = [];

  for (const req of (leavesQ.data ?? []) as any[]) {
    items.push({
      id: `leave:${req.id}`,
      kind: "leave",
      severity: "medium",
      title: `Отпуск: ${req.user?.full_name ?? req.user_id?.slice(0, 8) ?? "сотрудник"}`,
      subtitle: `${req.start_date} — ${req.end_date} · ${req.days_count ?? "?"} дн.`,
      actorName: req.user?.full_name,
      dueAt: req.start_date,
      raw: req,
    });
  }

  for (const p of (probationsQ.data ?? []) as any[]) {
    const end = p.end_date ? new Date(p.end_date).getTime() : null;
    if (!end || end >= now) continue; // only overdue
    items.push({
      id: `probation:${p.id}`,
      kind: "probation_overdue",
      severity: "high",
      title: `Просрочен испытательный: ${p.user?.full_name ?? "сотрудник"}`,
      subtitle: `Закончился ${p.end_date}`,
      actorName: p.user?.full_name,
      dueAt: p.end_date,
      raw: p,
    });
  }

  for (const r of (risksQ.data ?? []) as any[]) {
    items.push({
      id: `risk:${r.id ?? r.user_id}`,
      kind: "risk",
      severity: "high",
      title: `Высокий риск: ${r.user?.full_name ?? r.user_id?.slice(0, 8) ?? "сотрудник"}`,
      subtitle: `Attrition ${r.attrition_risk ?? "—"} · Burnout ${r.burnout_risk ?? "—"}`,
      raw: r,
    });
  }

  items.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ad - bd;
  });

  return {
    items,
    isLoading: leavesQ.isLoading || probationsQ.isLoading || risksQ.isLoading,
    counts: {
      leaves: (leavesQ.data ?? []).length,
      probations: items.filter((i) => i.kind === "probation_overdue").length,
      risks: (risksQ.data ?? []).length,
      total: items.length,
    },
    refetch: () => {
      leavesQ.refetch();
      probationsQ.refetch();
      risksQ.refetch();
    },
  };
};
