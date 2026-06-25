import { useState, useEffect } from "react";
import { useTasks, useCreateTask, useUpdateTask, useGoals, useTaskLinks, useLinkTaskToGoal, useUnlinkTaskFromGoal, type TrackerTask, type TaskStatus, type TaskUrgency } from "@/hooks/tracker";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UrgencyBadge, TaskStatusBadge, URGENCY_OPTIONS, TASK_STATUS_OPTIONS } from "@/components/tracker/Badges";
import { EmployeePicker, useEmployeeNameMap } from "@/components/tracker/EmployeePicker";
import { Plus, Link2, X, Calendar, User, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { TaskDetailDialog } from "@/components/tracker/TaskDetailDialog";

import { useTrackerProject } from "@/contexts/TrackerProjectContext";

const TaskCreateDialog = () => {
  const { projectId } = useTrackerProject();
  const uid = useEffectiveUserId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; urgency: TaskUrgency; due_at: string; assignee_id: string }>({
    title: "", description: "", urgency: "medium", due_at: "", assignee_id: "",
  });
  // когда диалог открывается — подставляем себя как адресата по умолчанию
  useEffect(() => {
    if (open && !form.assignee_id && uid) setForm((f) => ({ ...f, assignee_id: String(uid) }));
  }, [open, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useCreateTask();
  const save = async () => {
    if (!form.title.trim() || !form.assignee_id) return;
    await create.mutateAsync({
      title: form.title.trim(),
      description: form.description.trim() || null,
      urgency: form.urgency,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      status: "published",
      assignee_id: form.assignee_id,
      project_id: projectId ?? null,
    } as any);
    setOpen(false);
    setForm({ title: "", description: "", urgency: "medium", due_at: "", assignee_id: "" });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5" />Новое поручение</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новое поручение</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Текст поручения</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Описание</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
          <div>
            <Label>Адресат</Label>
            <EmployeePicker value={form.assignee_id} onChange={(v) => setForm({ ...form, assignee_id: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Срочность</Label>
              <Select value={form.urgency} onValueChange={(v: TaskUrgency) => setForm({ ...form, urgency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{URGENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Срок</Label><Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={save} disabled={create.isPending || !form.title.trim() || !form.assignee_id}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LinkGoalDialog = ({ taskId }: { taskId: string }) => {
  const [open, setOpen] = useState(false);
  const [goalId, setGoalId] = useState("");
  const { data: goals = [] } = useGoals({ status: "published" });
  const { data: links = [] } = useTaskLinks(taskId);
  const link = useLinkTaskToGoal();
  const unlink = useUnlinkTaskFromGoal();
  const linkedIds = new Set(links.map((l) => l.goal_id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Link2 className="w-3.5 h-3.5" />Цели {links.length > 0 && <span className="text-xs">({links.length})</span>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Связать поручение с целями</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Привязанные цели</Label>
            {links.length === 0 && <p className="text-sm text-muted-foreground">Пока не привязано ни к одной цели.</p>}
            {links.map((l) => {
              const g = goals.find((x) => x.id === l.goal_id);
              return (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="text-sm truncate">{g?.title ?? l.goal_id.slice(0, 8)}</span>
                  <button onClick={() => unlink.mutate({ id: l.id, task_id: taskId })} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2 border-t">
            <Label>Добавить</Label>
            <div className="flex gap-2">
              <Select value={goalId} onValueChange={setGoalId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Выберите цель…" /></SelectTrigger>
                <SelectContent>
                  {goals.filter((g) => !linkedIds.has(g.id)).map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={async () => { if (!goalId) return; await link.mutateAsync({ task_id: taskId, goal_id: goalId }); setGoalId(""); }} disabled={!goalId}>Привязать</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TaskRow = ({ task, onOpen }: { task: TrackerTask; onOpen: (t: TrackerTask) => void }) => {
  const update = useUpdateTask();
  const names = useEmployeeNameMap();
  const overdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== "done" && task.status !== "archived";
  const assigneeName = task.assignee_id ? (names.get(String(task.assignee_id)) || `ID ${String(task.assignee_id).slice(0, 8)}`) : null;
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] cursor-pointer" onClick={() => onOpen(task)}>
          <div className="flex items-center gap-2 flex-wrap">
            <UrgencyBadge urgency={task.urgency} />
            <p className="font-medium hover:underline">{task.title}</p>
          </div>
          {task.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
            {assigneeName && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="w-3 h-3" />{assigneeName}
              </span>
            )}
            {task.due_at && (
              <span className={`flex items-center gap-1 ${overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_at), "dd.MM.yyyy HH:mm")}
                {overdue && " · просрочено"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TaskStatusBadge status={task.status} />
          <Select value={task.status} onValueChange={(v: TaskStatus) => update.mutate({ id: task.id, status: v })}>
            <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpen(task)}>
            <MessageSquare className="w-3.5 h-3.5" />Открыть
          </Button>
          <LinkGoalDialog taskId={task.id} />
        </div>
      </CardContent>
    </Card>
  );
};

const TrackerTasks = () => {
  const uid = useEffectiveUserId();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [urgencyFilter, setUrgencyFilter] = useState<TaskUrgency | "all">("all");
  const [openTask, setOpenTask] = useState<TrackerTask | null>(null);
  const { data: tasks = [], isLoading } = useTasks({
    assignee_id: scope === "mine" ? uid ?? undefined : undefined,
    urgency: urgencyFilter === "all" ? undefined : urgencyFilter,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <Select value={scope} onValueChange={(v: any) => setScope(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Мои поручения</SelectItem>
              <SelectItem value="all">Все доступные</SelectItem>
            </SelectContent>
          </Select>
          <Select value={urgencyFilter} onValueChange={(v: any) => setUrgencyFilter(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все срочности</SelectItem>
              {URGENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <TaskCreateDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      ) : tasks.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Поручений нет.</CardContent></Card>
      ) : (
        <div className="space-y-3">{tasks.map((t) => <TaskRow key={t.id} task={t} onOpen={setOpenTask} />)}</div>
      )}

      <TaskDetailDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </div>
  );
};

export default TrackerTasks;
