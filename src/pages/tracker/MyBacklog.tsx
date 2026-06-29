import { useMemo, useState } from "react";
import { useTasks, useUpdateTask, type TrackerTask } from "@/hooks/tracker";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { UrgencyBadge, TaskStatusBadge, URGENCY_OPTIONS } from "@/components/tracker/Badges";
import { useEmployeeNameMap } from "@/components/tracker/EmployeePicker";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import { TaskFilters, applyTaskFilters, DEFAULT_TASK_FILTERS, type TaskFilterState } from "@/components/tracker/TaskFilters";
import { Calendar, User, ListChecks, AlertOctagon } from "lucide-react";
import { format } from "date-fns";

type Grouping = "urgency" | "due" | "flat";
type Scope = "assigned" | "authored";

const URGENCY_LABEL: Record<string, string> = Object.fromEntries(URGENCY_OPTIONS.map((o) => [o.value, o.label]));
const URGENCY_ORDER = ["critical", "high", "medium", "low"] as const;

const dueBucket = (t: TrackerTask): string => {
  if (!t.due_at) return "Без срока";
  const now = new Date();
  const d = new Date(t.due_at);
  const diff = Math.floor((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (diff < 0) return "Просрочено";
  if (diff === 0) return "Сегодня";
  if (diff <= 7) return "На этой неделе";
  if (diff <= 30) return "В этом месяце";
  return "Позже";
};

const TaskLine = ({ task, onOpen }: { task: TrackerTask; onOpen: (t: TrackerTask) => void }) => {
  const update = useUpdateTask();
  const names = useEmployeeNameMap();
  const overdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== "done" && task.status !== "archived";
  const assignee = task.assignee_id ? names.get(String(task.assignee_id)) : null;

  const markDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    update.mutate({ id: task.id, status: "done" });
  };

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => onOpen(task)}>
        <UrgencyBadge urgency={task.urgency} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <TaskStatusBadge status={task.status} />
            {assignee && <span className="flex items-center gap-1"><User className="w-3 h-3" />{assignee}</span>}
            {task.due_at && (
              <span className={`flex items-center gap-1 ${overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
                <Calendar className="w-3 h-3" />{format(new Date(task.due_at), "dd.MM.yyyy")}
              </span>
            )}
          </div>
        </div>
        {task.status !== "done" && task.status !== "archived" && (
          <Button size="sm" variant="outline" onClick={markDone}>Готово</Button>
        )}
      </CardContent>
    </Card>
  );
};

const MyBacklog = () => {
  const uid = useEffectiveUserId();
  const { openInspector } = useTrackerProject();
  const [scope, setScope] = useState<Scope>("assigned");
  const [grouping, setGrouping] = useState<Grouping>("urgency");
  const [hideClosed, setHideClosed] = useState(true);
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_TASK_FILTERS);
  const setOpenTask = openInspector;

  // assigned vs authored — серверный фильтр только для assigned (по существующему хуку)
  const { data: assignedTasks = [], isLoading: aLoading } = useTasks({
    assignee_id: scope === "assigned" ? uid ?? undefined : undefined,
  });

  // authored — фильтруем клиентски от полной выборки
  const baseTasks = useMemo(() => {
    if (scope === "authored") return assignedTasks.filter((t) => String(t.author_id) === String(uid));
    return assignedTasks;
  }, [assignedTasks, scope, uid]);

  const visible = useMemo(() => {
    const closed = new Set(["done", "archived"]);
    const stage1 = hideClosed ? baseTasks.filter((t) => !closed.has(t.status)) : baseTasks;
    return applyTaskFilters(stage1, filters);
  }, [baseTasks, filters, hideClosed]);

  const groups = useMemo(() => {
    if (grouping === "flat") return [{ key: "Все", tasks: visible }];
    if (grouping === "urgency") {
      return URGENCY_ORDER
        .map((u) => ({ key: URGENCY_LABEL[u] || u, tasks: visible.filter((t) => t.urgency === u) }))
        .filter((g) => g.tasks.length > 0);
    }
    // due
    const buckets = ["Просрочено", "Сегодня", "На этой неделе", "В этом месяце", "Позже", "Без срока"];
    return buckets
      .map((b) => ({ key: b, tasks: visible.filter((t) => dueBucket(t) === b) }))
      .filter((g) => g.tasks.length > 0);
  }, [visible, grouping]);

  const overdueCount = visible.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "done" && t.status !== "archived").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ListChecks className="w-4 h-4" />Активных</div>
          <div className="text-2xl font-semibold mt-1">{visible.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertOctagon className="w-4 h-4" />Просрочено</div>
          <div className="text-2xl font-semibold mt-1 text-red-600 dark:text-red-400">{overdueCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar className="w-4 h-4" />Сегодня</div>
          <div className="text-2xl font-semibold mt-1">{visible.filter((t) => dueBucket(t) === "Сегодня").length}</div>
        </CardContent></Card>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs text-muted-foreground">Какие задачи</Label>
          <Select value={scope} onValueChange={(v: Scope) => setScope(v)}>
            <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assigned">Что поручили мне</SelectItem>
              <SelectItem value="authored">Что я поручил</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Группировка</Label>
          <Select value={grouping} onValueChange={(v: Grouping) => setGrouping(v)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency">По срочности</SelectItem>
              <SelectItem value="due">По сроку</SelectItem>
              <SelectItem value="flat">Плоский список</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="hideClosed" checked={hideClosed} onCheckedChange={setHideClosed} />
          <Label htmlFor="hideClosed" className="text-sm">Скрыть закрытые</Label>
        </div>
      </div>

      <TaskFilters value={filters} onChange={setFilters} totalCount={baseTasks.length} shownCount={visible.length} />

      {aLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : groups.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          {baseTasks.length === 0 ? "Поручений пока нет." : "Ничего не найдено."}
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold text-foreground">{g.key}</h3>
                <span className="text-xs text-muted-foreground">{g.tasks.length}</span>
              </div>
              <div className="space-y-2">
                {g.tasks.map((t) => <TaskLine key={t.id} task={t} onOpen={setOpenTask} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      
    </div>
  );
};

export default MyBacklog;
