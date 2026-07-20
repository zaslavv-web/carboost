import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useUserProfile, useEffectiveUserId } from "@/hooks/useUserProfile";
import { useTasks, useUpdateTask, type TrackerTask } from "@/hooks/tracker";
import { UrgencyBadge, TaskStatusBadge } from "@/components/tracker/Badges";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProgressRing from "@/components/ProgressRing";
import {
  Calendar,
  ListChecks,
  Inbox as InboxIcon,
  Bell,
  MessageSquare,
  Target,
  User as UserIcon,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { format, isToday, isPast } from "date-fns";
import { ru } from "date-fns/locale";

const greetingFor = (h: number) =>
  h < 6 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";

const isClosed = (s: string) => s === "done" || s === "archived";

const EmployeeToday = () => {
  const navigate = useNavigate();
  const uid = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  const { openInspector } = useTrackerProject();

  const { data: tasks = [], isLoading: tasksLoading } = useTasks({ assignee_id: uid ?? undefined });

  // Inbox: непрочитанные уведомления (упоминания, назначения, запросы от HR/руководителя)
  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ["employee_today_inbox", uid],
    enabled: !!uid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("notifications")
        .select("id,title,body,url,created_at,is_read,type")
        .eq("user_id", uid!)
        .eq("is_read", false)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as Array<{
        id: string;
        title: string | null;
        body: string | null;
        url: string | null;
        created_at: string;
        is_read: boolean;
        type: string | null;
      }>;
    },
  });

  const { activeTasks, todayTasks, overdueTasks } = useMemo(() => {
    const active = tasks.filter((t) => !isClosed(t.status));
    const todayList = active.filter((t) => t.due_at && isToday(new Date(t.due_at)));
    const overdue = active.filter(
      (t) => t.due_at && isPast(new Date(t.due_at)) && !isToday(new Date(t.due_at))
    );
    return { activeTasks: active, todayTasks: todayList, overdueTasks: overdue };
  }, [tasks]);

  // Прогресс роста — компетенции / цели
  const { data: comps = [] } = useQuery({
    queryKey: ["today_competencies", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("competencies")
        .select("skill_value")
        .eq("user_id", uid!);
      if (error) return [];
      return data ?? [];
    },
  });
  const { data: goals = [] } = useQuery({
    queryKey: ["today_goals", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("career_goals")
        .select("id,title,is_completed")
        .eq("user_id", uid!);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; title: string; is_completed: boolean }>;
    },
  });

  const avgSkill = comps.length
    ? Math.round(
        (comps.reduce((s: number, c: any) => s + Number(c.skill_value || 0), 0) / comps.length) * 10
      ) / 10
    : 0;
  const goalsDone = goals.filter((g) => g.is_completed).length;
  const goalsTotal = goals.length;
  const readiness = Number(profile?.role_readiness ?? 0);
  const nextGoal = goals.find((g) => !g.is_completed);

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "коллега";
  const summary =
    overdueTasks.length > 0
      ? `${overdueTasks.length} просроч. · ${todayTasks.length} сегодня · ${inbox.length} входящих`
      : todayTasks.length + inbox.length === 0
      ? "На сегодня всё тихо — можно двигаться по треку роста."
      : `${todayTasks.length} задач на сегодня · ${inbox.length} входящих`;

  const dashboardVisible = [...overdueTasks, ...todayTasks, ...activeTasks]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .slice(0, 6);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-serif tracking-tight">
          {greetingFor(new Date().getHours())}, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{summary}</p>
      </header>

      {/* Быстрые метрики */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={<ListChecks className="w-4 h-4" />} label="Активных задач" value={activeTasks.length} onClick={() => navigate("/tracker/my-backlog")} />
        <MetricCard icon={<Calendar className="w-4 h-4" />} label="Сегодня" value={todayTasks.length} tone={todayTasks.length ? "primary" : "muted"} onClick={() => navigate("/tracker/my-backlog")} />
        <MetricCard icon={<Bell className="w-4 h-4" />} label="Входящие" value={inbox.length} tone={inbox.length ? "primary" : "muted"} onClick={() => navigate("/notifications")} />
        <MetricCard icon={<Target className="w-4 h-4" />} label="Готовность к роли" value={`${Math.round(readiness)}%`} onClick={() => navigate("/career-track")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Задачи + Инбокс */}
        <div className="space-y-6">
          <section className="space-y-2">
            <SectionHeader
              title="Мои задачи на сегодня"
              action={activeTasks.length > 6 ? { label: "Все задачи", onClick: () => navigate("/tracker/my-backlog") } : undefined}
            />
            {tasksLoading ? (
              <Loading />
            ) : dashboardVisible.length === 0 ? (
              <EmptyState icon={<ListChecks className="w-6 h-6" />} text="Задач нет — свободный день." />
            ) : (
              <div className="space-y-2">
                {dashboardVisible.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openInspector} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <SectionHeader
              title="Входящие"
              hint="сообщения, упоминания, запросы"
              action={inbox.length > 5 ? { label: "Все уведомления", onClick: () => navigate("/notifications") } : undefined}
            />
            {inboxLoading ? (
              <Loading />
            ) : inbox.length === 0 ? (
              <EmptyState icon={<InboxIcon className="w-6 h-6" />} text="Инбокс чистый." />
            ) : (
              <div className="space-y-2">
                {inbox.slice(0, 5).map((n) => (
                  <InboxRow key={n.id} n={n} onOpen={() => (n.url ? navigate(n.url) : navigate("/notifications"))} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Прогресс роста */}
        <aside className="space-y-4">
          <Card className="border-primary/30">
            <CardContent className="p-5 text-center space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Прогресс роста</div>
              <div className="flex justify-center">
                <ProgressRing progress={readiness} size={120} />
              </div>
              <div className="text-sm text-muted-foreground">Готовность к роли</div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-left">
                <div className="rounded-md bg-secondary/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Ср. компетенций</div>
                  <div className="text-lg font-semibold">{avgSkill || "—"}</div>
                </div>
                <div className="rounded-md bg-secondary/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Цели</div>
                  <div className="text-lg font-semibold">{goalsDone}/{goalsTotal || "—"}</div>
                </div>
              </div>
              {nextGoal && (
                <button
                  onClick={() => navigate("/career-track")}
                  className="w-full text-left rounded-md border border-border/60 px-3 py-2 hover:bg-secondary/60 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Sparkles className="w-3 h-3" /> Следующий шаг
                  </div>
                  <div className="text-sm mt-0.5 line-clamp-2">{nextGoal.title}</div>
                </button>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/career-track")}>
                Открыть карьерный трек <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Быстрые действия</div>
              <QuickLink icon={<UserIcon className="w-4 h-4" />} label="Мой паспорт" onClick={() => navigate("/passport")} />
              <QuickLink icon={<MessageSquare className="w-4 h-4" />} label="Чаты" onClick={() => navigate("/chats")} />
              <QuickLink icon={<Target className="w-4 h-4" />} label="Отпуска" onClick={() => navigate("/leaves")} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
};

/* ---------- small blocks ---------- */

const MetricCard = ({
  icon,
  label,
  value,
  tone = "default",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "muted";
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className="text-left rounded-lg border border-border/60 bg-card hover:border-primary/50 transition-colors p-3"
  >
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <div className={`text-2xl font-semibold mt-1 ${tone === "primary" ? "text-primary" : tone === "muted" ? "text-muted-foreground" : ""}`}>
      {value}
    </div>
  </button>
);

const SectionHeader = ({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
    {action && (
      <Button variant="ghost" size="sm" onClick={action.onClick} className="text-xs">
        {action.label} <ChevronRight className="w-3 h-3 ml-1" />
      </Button>
    )}
  </div>
);

const TaskRow = ({ task, onOpen }: { task: TrackerTask; onOpen: (t: TrackerTask) => void }) => {
  const update = useUpdateTask();
  const overdue =
    task.due_at && new Date(task.due_at) < new Date() && !isClosed(task.status);
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => onOpen(task)}>
        <UrgencyBadge urgency={task.urgency} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <TaskStatusBadge status={task.status} />
            {task.due_at && (
              <span className={`flex items-center gap-1 ${overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_at), "d MMM", { locale: ru })}
              </span>
            )}
          </div>
        </div>
        {!isClosed(task.status) && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              update.mutate({ id: task.id, status: "done" });
            }}
          >
            Готово
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const InboxRow = ({
  n,
  onOpen,
}: {
  n: { id: string; title: string | null; body: string | null; created_at: string; type: string | null };
  onOpen: () => void;
}) => (
  <button
    onClick={onOpen}
    className="w-full text-left rounded-lg border border-border/60 hover:border-primary/50 hover:bg-secondary/40 transition-colors p-3"
  >
    <div className="flex items-start gap-2">
      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{n.title || "Уведомление"}</div>
        {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
        <div className="text-[11px] text-muted-foreground/70 mt-1">
          {format(new Date(n.created_at), "d MMM, HH:mm", { locale: ru })}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  </button>
);

const QuickLink = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between px-2 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
  >
    <span className="flex items-center gap-2">
      {icon}
      {label}
    </span>
    <ChevronRight className="w-4 h-4 text-muted-foreground" />
  </button>
);

const Loading = () => (
  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загрузка…
  </div>
);

const EmptyState = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-muted-foreground text-sm">
    <div className="mx-auto mb-2 text-muted-foreground/60">{icon}</div>
    {text}
  </div>
);

export default EmployeeToday;
