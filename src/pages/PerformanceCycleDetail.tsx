import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { performanceApi, type CycleParticipant } from "@/integrations/laravel/performance";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "outline",
  self_done: "secondary",
  manager_done: "secondary",
  finalized: "default",
  open: "default",
  closed: "secondary",
};

const PAGE_SIZE = 50;

const fmt = (v?: number | null) => (v != null ? Number(v).toFixed(2) : "—");

const ROLE_LABEL: Record<string, string> = {
  self: "Самооценка",
  manager: "Руководитель",
  peer: "Коллега",
  subordinate: "Подчинённый",
  hr: "HR",
};

const PerformanceCycleDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation("performance");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["perf", "cycle-detail", id],
    queryFn: () => performanceApi.cycleDetail(id),
    enabled: !!id,
  });

  const participants = useMemo(() => {
    const rows = data?.participants ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (department !== "all" && (p.department ?? "") !== department) return false;
      if (q && !`${p.full_name ?? ""} ${p.position ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data?.participants, search, status, department]);

  const visible = participants.slice(0, limit);

  const runAction = async (action: "open" | "close") => {
    const res = action === "open" ? await performanceApi.openCycle(id) : await performanceApi.closeCycle(id);
    if ((res as any)?.error) {
      toast.error((res as any).error.message ?? "Ошибка");
      return;
    }
    toast.success(action === "open" ? t("messages.cycleOpened") : t("messages.cycleClosed"));
    qc.invalidateQueries({ queryKey: ["perf"] });
  };

  if (isLoading) {
    return <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-primary" />;
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/performance")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("title")}
        </Button>
        <p className="mt-6 text-center text-muted-foreground">Цикл оценки не найден.</p>
      </div>
    );
  }

  const { cycle, summary, departments } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate("/performance")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("title")}
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {cycle.title}
            <Badge variant={STATUS_VARIANT[cycle.status]}>{t(`status.${cycle.status}`)}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {cycle.period_start} — {cycle.period_end}
            {cycle.deadline ? ` · ${t("fields.deadline")}: ${cycle.deadline}` : ""}
          </p>
          {cycle.weights && (
            <p className="text-xs text-muted-foreground">
              {t("fields.weightSelf")} {cycle.weights.self ?? 0} · {t("fields.weightManager")} {cycle.weights.manager ?? 0} ·{" "}
              {t("fields.weightPeer")} {cycle.weights.peer ?? 0}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {cycle.status === "draft" && <Button onClick={() => runAction("open")}>{t("actions.open")}</Button>}
          {cycle.status === "open" && (
            <Button variant="outline" onClick={() => runAction("close")}>
              {t("actions.close")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Участников</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="h-5 w-5 text-muted-foreground" />
            {summary.total}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Средний итоговый балл</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{fmt(summary.avg_final_score)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Собрано фидбека</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.feedback_count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Завершённость</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-semibold">{summary.completion}%</p>
            <Progress value={summary.completion} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Статусы</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["draft", "self_done", "manager_done", "finalized"] as const).map((s) => (
            <Badge key={s} variant={STATUS_VARIANT[s]} className="cursor-pointer" onClick={() => setStatus(s)}>
              {t(`status.${s}`)}: {summary.statuses?.[s] ?? 0}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Поиск по сотруднику или должности"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {(["draft", "self_done", "manager_done", "finalized"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все отделы</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Сотрудник</th>
              <th className="px-3 py-2 text-left">Отдел</th>
              <th className="px-3 py-2 text-left">Руководитель</th>
              <th className="px-3 py-2 text-left">Статус</th>
              <th className="px-3 py-2 text-right">Self</th>
              <th className="px-3 py-2 text-right">Manager</th>
              <th className="px-3 py-2 text-right">Peer</th>
              <th className="px-3 py-2 text-right">Final</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <ParticipantRow key={p.id} p={p} expanded={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {visible.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.full_name ?? "Без имени"}</p>
                <p className="text-xs text-muted-foreground">{p.position ?? "—"} · {p.department ?? "—"}</p>
              </div>
              <Badge variant={STATUS_VARIANT[p.status]}>{t(`status.${p.status}`)}</Badge>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
              {(["self_score", "manager_score", "peer_score", "final_score"] as const).map((k) => (
                <div key={k} className={cn("rounded-md p-1.5", k === "final_score" ? "bg-primary/10 text-primary" : "bg-muted")}>
                  <p className="text-[10px] uppercase opacity-70">{k.replace("_score", "")}</p>
                  <p className="font-semibold">{fmt(p[k])}</p>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              Фидбек ({p.feedback.length})
            </Button>
            {expanded === p.id && <FeedbackBlock p={p} />}
          </div>
        ))}
      </div>

      {participants.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">{t("empty.reviews")}</p>
      )}
      {limit < participants.length && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Показать ещё ({participants.length - limit})
          </Button>
        </div>
      )}
    </div>
  );
};

const ParticipantRow = ({ p, expanded, onToggle }: { p: CycleParticipant; expanded: boolean; onToggle: () => void }) => {
  const { t } = useTranslation("performance");
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-accent/40" onClick={onToggle}>
        <td className="px-3 py-2">
          <p className="font-medium">{p.full_name ?? "Без имени"}</p>
          <p className="text-xs text-muted-foreground">{p.position ?? "—"}</p>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{p.department ?? "—"}</td>
        <td className="px-3 py-2 text-muted-foreground">{p.manager_name ?? "—"}</td>
        <td className="px-3 py-2">
          <Badge variant={STATUS_VARIANT[p.status]}>{t(`status.${p.status}`)}</Badge>
        </td>
        <td className="px-3 py-2 text-right">{fmt(p.self_score)}</td>
        <td className="px-3 py-2 text-right">{fmt(p.manager_score)}</td>
        <td className="px-3 py-2 text-right">{fmt(p.peer_score)}</td>
        <td className="px-3 py-2 text-right font-semibold text-primary">{fmt(p.final_score)}</td>
        <td className="px-3 py-2 text-right">
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={9} className="px-3 py-3">
            <FeedbackBlock p={p} />
          </td>
        </tr>
      )}
    </>
  );
};

const FeedbackBlock = ({ p }: { p: CycleParticipant }) => (
  <div className="space-y-3">
    {p.summary && <p className="text-sm italic text-muted-foreground">"{p.summary}"</p>}
    {p.feedback.length === 0 ? (
      <p className="text-sm text-muted-foreground">Фидбек ещё не собран.</p>
    ) : (
      <div className="grid gap-2 md:grid-cols-2">
        {p.feedback.map((f) => (
          <div key={f.id} className="rounded-md border border-border bg-card p-3 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">
                {ROLE_LABEL[f.role] ?? f.role}
                {f.reviewer_name ? ` · ${f.reviewer_name}` : ""}
              </span>
              <Badge variant="secondary">{fmt(f.overall_score)}</Badge>
            </div>
            {f.strengths && <p className="text-xs"><span className="text-muted-foreground">Сильные стороны: </span>{f.strengths}</p>}
            {f.improvements && <p className="text-xs"><span className="text-muted-foreground">Зоны роста: </span>{f.improvements}</p>}
            {f.comments && <p className="text-xs text-muted-foreground">{f.comments}</p>}
            {f.competency_scores && Object.keys(f.competency_scores).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {Object.entries(f.competency_scores).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="text-[10px]">
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )}
    {p.reviewers.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {p.reviewers.map((r) => (
          <Badge key={r.id} variant={r.status === "submitted" ? "default" : "outline"} className="text-[10px]">
            {ROLE_LABEL[r.role] ?? r.role}: {r.reviewer_name ?? "—"} · {r.status}
          </Badge>
        ))}
      </div>
    )}
  </div>
);

export default PerformanceCycleDetail;
