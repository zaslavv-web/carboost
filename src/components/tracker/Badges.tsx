import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskUrgency, TaskStatus, GoalStatus, MeetingStatus } from "@/hooks/tracker";

const URGENCY: Record<TaskUrgency, { label: string; cls: string; dot: string }> = {
  critical: { label: "Критическая", cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300", dot: "bg-red-500" },
  high:     { label: "Высокая",     cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  medium:   { label: "Средняя",     cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  low:      { label: "Низкая",      cls: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  draft:            { label: "Черновик",     cls: "bg-muted text-muted-foreground" },
  published:        { label: "Активно",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  awaiting_checkin: { label: "Ожидает чек-ин", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  done:             { label: "Выполнено",    cls: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200" },
  orphan:           { label: "Сирота",       cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  needs_attention:  { label: "Требует внимания", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  archived:         { label: "Архив",        cls: "bg-muted text-muted-foreground" },
};

const GOAL_STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  draft:        { label: "Черновик",          cls: "bg-muted text-muted-foreground" },
  published:    { label: "Опубликовано",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  needs_review: { label: "Требует пересмотра", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  archived:     { label: "Архив",             cls: "bg-muted text-muted-foreground" },
};

const MEETING_STATUS: Record<MeetingStatus, { label: string; cls: string }> = {
  planned:   { label: "Запланирована", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  done:      { label: "Проведена",      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Отменена",       cls: "bg-muted text-muted-foreground" },
};

export const UrgencyBadge = ({ urgency }: { urgency: TaskUrgency }) => {
  const u = URGENCY[urgency];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", u.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", u.dot)} />
      {u.label}
    </Badge>
  );
};

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => {
  const s = TASK_STATUS[status];
  return <Badge variant="secondary" className={cn("font-medium", s.cls)}>{s.label}</Badge>;
};

export const GoalStatusBadge = ({ status }: { status: GoalStatus }) => {
  const s = GOAL_STATUS[status];
  return <Badge variant="secondary" className={cn("font-medium", s.cls)}>{s.label}</Badge>;
};

export const MeetingStatusBadge = ({ status }: { status: MeetingStatus }) => {
  const s = MEETING_STATUS[status];
  return <Badge variant="secondary" className={cn("font-medium", s.cls)}>{s.label}</Badge>;
};

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "draft", label: TASK_STATUS.draft.label },
  { value: "published", label: TASK_STATUS.published.label },
  { value: "awaiting_checkin", label: TASK_STATUS.awaiting_checkin.label },
  { value: "done", label: TASK_STATUS.done.label },
  { value: "needs_attention", label: TASK_STATUS.needs_attention.label },
  { value: "orphan", label: TASK_STATUS.orphan.label },
  { value: "archived", label: TASK_STATUS.archived.label },
];

export const URGENCY_OPTIONS: { value: TaskUrgency; label: string }[] = [
  { value: "critical", label: URGENCY.critical.label },
  { value: "high", label: URGENCY.high.label },
  { value: "medium", label: URGENCY.medium.label },
  { value: "low", label: URGENCY.low.label },
];

export const GOAL_STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: "draft", label: GOAL_STATUS.draft.label },
  { value: "published", label: GOAL_STATUS.published.label },
  { value: "needs_review", label: GOAL_STATUS.needs_review.label },
  { value: "archived", label: GOAL_STATUS.archived.label },
];
