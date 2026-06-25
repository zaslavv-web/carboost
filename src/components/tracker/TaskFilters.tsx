import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { EmployeePicker } from "@/components/tracker/EmployeePicker";
import { URGENCY_OPTIONS, TASK_STATUS_OPTIONS } from "@/components/tracker/Badges";
import {
  useTrackerProject,
} from "@/contexts/TrackerProjectContext";
import {
  useProject,
  useWorkflowStatuses,
  useSprints,
  type TrackerTask,
  type TaskStatus,
  type TaskUrgency,
} from "@/hooks/tracker";

export type TaskSortField = "created_at" | "due_at" | "urgency" | "story_points" | "title";
export type SortDir = "asc" | "desc";

export interface TaskFilterState {
  q: string;
  status: TaskStatus | "all";
  workflowStatusId: string | "all";
  sprintId: string | "all" | "none";
  assigneeId: string;
  urgency: TaskUrgency | "all";
  sortBy: TaskSortField;
  sortDir: SortDir;
}

export const DEFAULT_TASK_FILTERS: TaskFilterState = {
  q: "",
  status: "all",
  workflowStatusId: "all",
  sprintId: "all",
  assigneeId: "",
  urgency: "all",
  sortBy: "created_at",
  sortDir: "desc",
};

const URGENCY_RANK: Record<TaskUrgency, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const SORT_OPTIONS: { value: TaskSortField; label: string }[] = [
  { value: "created_at", label: "Создано" },
  { value: "due_at", label: "Дедлайн" },
  { value: "urgency", label: "Приоритет" },
  { value: "story_points", label: "SP" },
  { value: "title", label: "Название" },
];

export function applyTaskFilters(tasks: TrackerTask[], f: TaskFilterState): TrackerTask[] {
  const q = f.q.trim().toLowerCase();
  const filtered = tasks.filter((t) => {
    if (q) {
      const hay = `${t.title} ${t.description ?? ""} ${t.jira_key ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.workflowStatusId !== "all" && t.workflow_status_id !== f.workflowStatusId) return false;
    if (f.sprintId === "none" && t.sprint_id) return false;
    if (f.sprintId !== "all" && f.sprintId !== "none" && t.sprint_id !== f.sprintId) return false;
    if (f.assigneeId && t.assignee_id !== f.assigneeId) return false;
    if (f.urgency !== "all" && t.urgency !== f.urgency) return false;
    return true;
  });
  const dir = f.sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let av: any, bv: any;
    switch (f.sortBy) {
      case "urgency":
        av = URGENCY_RANK[a.urgency] ?? 0; bv = URGENCY_RANK[b.urgency] ?? 0; break;
      case "story_points":
        av = a.story_points ?? -1; bv = b.story_points ?? -1; break;
      case "title":
        return a.title.localeCompare(b.title) * dir;
      case "due_at":
        av = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY * (dir === 1 ? 1 : -1);
        bv = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY * (dir === 1 ? 1 : -1);
        break;
      default:
        av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return filtered;
}

export function activeFilterCount(f: TaskFilterState): number {
  let n = 0;
  if (f.q.trim()) n++;
  if (f.status !== "all") n++;
  if (f.workflowStatusId !== "all") n++;
  if (f.sprintId !== "all") n++;
  if (f.assigneeId) n++;
  if (f.urgency !== "all") n++;
  return n;
}

interface Props {
  value: TaskFilterState;
  onChange: (v: TaskFilterState) => void;
  totalCount: number;
  shownCount: number;
}

export const TaskFilters = ({ value, onChange, totalCount, shownCount }: Props) => {
  const { projectId } = useTrackerProject();
  const { data: project } = useProject(projectId ?? undefined);
  const { data: workflowStatuses = [] } = useWorkflowStatuses(project?.workflow_id ?? null);
  const { data: sprints = [] } = useSprints(projectId ?? undefined);

  const set = (patch: Partial<TaskFilterState>) => onChange({ ...value, ...patch });
  const reset = () => onChange(DEFAULT_TASK_FILTERS);
  const activeN = useMemo(() => activeFilterCount(value), [value]);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Поиск по названию, описанию, ключу…"
            className="pl-8 h-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{shownCount} / {totalCount}</span>
          {activeN > 0 && (
            <>
              <Badge variant="secondary" className="text-[10px]">{activeN} фильтр{activeN === 1 ? "" : activeN < 5 ? "а" : "ов"}</Badge>
              <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={reset}>
                <X className="w-3.5 h-3.5" />Сбросить
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Select value={value.status} onValueChange={(v: any) => set({ status: v })}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {TASK_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.urgency} onValueChange={(v: any) => set({ urgency: v })}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Приоритет" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой приоритет</SelectItem>
            {URGENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.workflowStatusId}
          onValueChange={(v) => set({ workflowStatusId: v as any })}
          disabled={!project?.workflow_id || workflowStatuses.length === 0}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={project?.workflow_id ? "Воркфлоу-статус" : "Воркфлоу не задан"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все воркфлоу-статусы</SelectItem>
            {workflowStatuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.sprintId}
          onValueChange={(v) => set({ sprintId: v as any })}
          disabled={!projectId}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={projectId ? "Спринт" : "Выберите проект"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все спринты</SelectItem>
            <SelectItem value="none">Без спринта (бэклог)</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}{s.status === "active" ? " · активный" : s.status === "completed" ? " · завершён" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <EmployeePicker
            value={value.assigneeId}
            onChange={(v) => set({ assigneeId: v })}
            placeholder="Любой исполнитель"
          />
        </div>
        {value.assigneeId && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => set({ assigneeId: "" })}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        <Select value={value.sortBy} onValueChange={(v: any) => set({ sortBy: v })}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>Сортировка: {o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => set({ sortDir: value.sortDir === "asc" ? "desc" : "asc" })}
          title={value.sortDir === "asc" ? "По возрастанию" : "По убыванию"}
        >
          {value.sortDir === "asc" ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
          {value.sortDir === "asc" ? "↑" : "↓"}
        </Button>
      </div>
    </div>
  );
};
