import { useState } from "react";
import {
  useGoals, useCreateGoal, useUpdateGoal,
  useKeyResults, useUpsertKeyResult, useDeleteKeyResult,
  useKrTaskLinks, useTasks, useLinkTaskToGoal, useUnlinkTaskFromGoal,
  type TrackerGoal, type GoalStatus,
} from "@/hooks/tracker";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { GoalStatusBadge, GOAL_STATUS_OPTIONS, TaskStatusBadge, UrgencyBadge } from "@/components/tracker/Badges";
import { Plus, ChevronDown, ChevronRight, Trash2, Link2, X } from "lucide-react";

const GoalCreateDialog = () => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateGoal();

  const handleSave = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({ title: title.trim(), description: description.trim() || null, status: "draft" });
    setOpen(false); setTitle(""); setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1.5" />Новая цель</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новая цель (OKR)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Название</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Достичь NPS 60" /></div>
          <div><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const KrTasksDialog = ({ krId, goalId }: { krId: string; goalId: string }) => {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const { data: links = [] } = useKrTaskLinks(krId);
  const { data: tasks = [] } = useTasks();
  const link = useLinkTaskToGoal();
  const unlink = useUnlinkTaskFromGoal();
  const linkedTaskIds = new Set(links.map((l) => l.task_id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title="Привязать поручения"
        >
          <Link2 className="w-3.5 h-3.5" />
          {links.length > 0 && <span>{links.length}</span>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Поручения для ключевого результата</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Привязанные поручения</Label>
            {links.length === 0 && <p className="text-sm text-muted-foreground">Пока ничего не привязано.</p>}
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {l.task?.urgency && <UrgencyBadge urgency={l.task.urgency as any} />}
                  <span className="text-sm truncate">{l.task?.title ?? l.task_id.slice(0, 8)}</span>
                  {l.task?.status && <TaskStatusBadge status={l.task.status as any} />}
                </div>
                <button
                  onClick={() => unlink.mutate({ id: l.id, key_result_id: krId, task_id: l.task_id })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2 border-t">
            <Label>Привязать существующее</Label>
            <div className="flex gap-2">
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Выберите поручение…" /></SelectTrigger>
                <SelectContent>
                  {tasks.filter((t) => !linkedTaskIds.has(t.id)).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={async () => {
                  if (!taskId) return;
                  await link.mutateAsync({ task_id: taskId, goal_id: goalId, key_result_id: krId });
                  setTaskId("");
                }}
                disabled={!taskId || link.isPending}
              >
                Привязать
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const KeyResultsBlock = ({ goalId }: { goalId: string }) => {
  const { data: krs = [] } = useKeyResults(goalId);
  const upsert = useUpsertKeyResult();
  const del = useDeleteKeyResult();
  const [draft, setDraft] = useState({ title: "", target_value: 100, unit: "%", weight: 1 });

  return (
    <div className="space-y-3 mt-4 pt-4 border-t">
      <p className="text-sm font-medium">Ключевые результаты</p>
      <div className="space-y-2">
        {krs.map((kr) => {
          const denom = kr.target_value - kr.start_value;
          const pct = denom === 0 ? 0 : Math.max(0, Math.min(100, ((kr.current_value - kr.start_value) / denom) * 100));
          return (
            <div key={kr.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-sm font-medium flex-1">{kr.title}</p>
                <KrTasksDialog krId={kr.id} goalId={goalId} />
                <button onClick={() => del.mutate({ id: kr.id, goal_id: goalId })} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" value={kr.current_value} onChange={(e) => upsert.mutate({ id: kr.id, goal_id: goalId, current_value: Number(e.target.value) })} className="w-28 h-8" />
                <span className="text-xs text-muted-foreground">из {kr.target_value} {kr.unit} · вес {kr.weight}</span>
                <span className="ml-auto text-xs tabular-nums">{Math.round(pct)}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          );
        })}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label className="text-xs">Новый KR</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Название" className="h-8" /></div>
        <div className="w-24"><Label className="text-xs">Цель</Label><Input type="number" value={draft.target_value} onChange={(e) => setDraft({ ...draft, target_value: Number(e.target.value) })} className="h-8" /></div>
        <div className="w-20"><Label className="text-xs">Ед.</Label><Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="h-8" /></div>
        <div className="w-16"><Label className="text-xs">Вес</Label><Input type="number" step="0.1" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })} className="h-8" /></div>
        <Button size="sm" onClick={async () => { if (!draft.title.trim()) return; await upsert.mutateAsync({ goal_id: goalId, ...draft, start_value: 0, current_value: 0, position: 0 }); setDraft({ title: "", target_value: 100, unit: "%", weight: 1 }); }}>Добавить</Button>
      </div>
    </div>
  );
};

const GoalCard = ({ goal }: { goal: TrackerGoal }) => {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateGoal();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setExpanded((e) => !e)} className="mt-1 text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{goal.title}</h3>
              <GoalStatusBadge status={goal.status} />
            </div>
            {goal.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>}
            <div className="mt-3 flex items-center gap-3">
              <Progress value={Number(goal.progress)} className="h-2 flex-1" />
              <span className="text-xs tabular-nums font-medium w-12 text-right">{Math.round(Number(goal.progress))}%</span>
            </div>
          </div>
          <Select value={goal.status} onValueChange={(v: GoalStatus) => update.mutate({ id: goal.id, status: v, published_at: v === "published" ? new Date().toISOString() : goal.published_at })}>
            <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{GOAL_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {expanded && <KeyResultsBlock goalId={goal.id} />}
      </CardContent>
    </Card>
  );
};

const TrackerGoals = () => {
  const uid = useEffectiveUserId();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const { data: goals = [], isLoading } = useGoals(scope === "mine" ? { holder_id: uid ?? undefined } : undefined);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Select value={scope} onValueChange={(v: any) => setScope(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">Мои цели</SelectItem>
            <SelectItem value="all">Все доступные</SelectItem>
          </SelectContent>
        </Select>
        <GoalCreateDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      ) : goals.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Пока нет целей. Создайте первую — она появится здесь.</CardContent></Card>
      ) : (
        <div className="space-y-3">{goals.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
      )}
    </div>
  );
};

export default TrackerGoals;
