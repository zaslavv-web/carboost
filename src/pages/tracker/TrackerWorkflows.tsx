import { useEffect, useMemo, useState } from "react";
import {
  useWorkflows, useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow,
  useWorkflowStatuses, useUpsertWorkflowStatus, useDeleteWorkflowStatus,
  useWorkflowTransitions, useUpsertWorkflowTransition, useDeleteWorkflowTransition,
  type TrackerWorkflow, type WorkflowStatusCategory,
} from "@/hooks/tracker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowRight, GitBranch, Workflow } from "lucide-react";

const CATEGORY_LABEL: Record<WorkflowStatusCategory, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Завершено",
};

const CATEGORY_COLOR: Record<WorkflowStatusCategory, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "status";

/* ============ Воркфлоу: список + создание ============ */
const WorkflowCreateDialog = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateWorkflow();
  const save = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), description: description.trim() || null });
    setOpen(false); setName(""); setDescription("");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1.5" />Новый воркфлоу</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новый воркфлоу</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Название</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Разработка" /></div>
          <div><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={save} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============ Конструктор статусов ============ */
const StatusesEditor = ({ workflowId }: { workflowId: string }) => {
  const { data: statuses = [] } = useWorkflowStatuses(workflowId);
  const upsert = useUpsertWorkflowStatus();
  const remove = useDeleteWorkflowStatus();

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<WorkflowStatusCategory>("todo");

  const addStatus = async () => {
    const name = newName.trim();
    if (!name) return;
    const position = (statuses[statuses.length - 1]?.position ?? -1) + 1;
    const isInitial = statuses.length === 0;
    await upsert.mutateAsync({
      workflow_id: workflowId,
      name,
      key: slugify(name),
      category: newCategory,
      position,
      is_initial: isInitial,
    });
    setNewName("");
  };

  const setInitial = async (id: string) => {
    for (const s of statuses) {
      if (s.is_initial !== (s.id === id)) {
        await upsert.mutateAsync({ id: s.id, workflow_id: workflowId, is_initial: s.id === id });
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {statuses.length === 0 && (
          <p className="text-xs text-muted-foreground">Добавьте первый статус — он автоматически станет стартовым.</p>
        )}
        {statuses.map((s) => (
          <div key={s.id} className="flex items-center gap-2 p-2 border rounded-md bg-background">
            <span className="text-xs font-mono text-muted-foreground w-6 text-right">{s.position + 1}.</span>
            <Input
              defaultValue={s.name}
              className="h-8 max-w-[220px]"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== s.name) upsert.mutate({ id: s.id, workflow_id: workflowId, name: v, key: slugify(v) });
              }}
            />
            <Select
              value={s.category}
              onValueChange={(v) => upsert.mutate({ id: s.id, workflow_id: workflowId, category: v as WorkflowStatusCategory })}
            >
              <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABEL) as WorkflowStatusCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className={CATEGORY_COLOR[s.category]} variant="outline">{CATEGORY_LABEL[s.category]}</Badge>
            <Button
              size="sm"
              variant={s.is_initial ? "default" : "outline"}
              className="h-8"
              onClick={() => setInitial(s.id)}
            >
              {s.is_initial ? "Старт" : "Сделать стартом"}
            </Button>
            <Button
              size="icon" variant="ghost" className="h-8 w-8 ml-auto text-destructive"
              onClick={() => {
                if (confirm(`Удалить статус «${s.name}»?`)) remove.mutate({ id: s.id, workflow_id: workflowId });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 pt-1 border-t">
        <div className="flex-1">
          <Label className="text-xs">Новый статус</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например: «На ревью»" className="h-8" />
        </div>
        <Select value={newCategory} onValueChange={(v) => setNewCategory(v as WorkflowStatusCategory)}>
          <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(CATEGORY_LABEL) as WorkflowStatusCategory[]).map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" onClick={addStatus}><Plus className="w-3.5 h-3.5 mr-1" />Добавить</Button>
      </div>
    </div>
  );
};

/* ============ Переходы ============ */
const TransitionsEditor = ({ workflowId }: { workflowId: string }) => {
  const { data: statuses = [] } = useWorkflowStatuses(workflowId);
  const { data: transitions = [] } = useWorkflowTransitions(workflowId);
  const upsert = useUpsertWorkflowTransition();
  const remove = useDeleteWorkflowTransition();

  const [from, setFrom] = useState<string>("__any__");
  const [to, setTo] = useState<string>("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!to && statuses[0]) setTo(statuses[0].id);
  }, [statuses, to]);

  const byId = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const add = async () => {
    if (!to || !name.trim()) return;
    await upsert.mutateAsync({
      workflow_id: workflowId,
      from_status_id: from === "__any__" ? null : from,
      to_status_id: to,
      name: name.trim(),
    });
    setName("");
  };

  if (statuses.length === 0) {
    return <p className="text-xs text-muted-foreground">Сначала добавьте статусы.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {transitions.length === 0 && (
          <p className="text-xs text-muted-foreground">По умолчанию задачи можно переводить между всеми статусами. Добавьте правила, чтобы зафиксировать процесс.</p>
        )}
        {transitions.map((tr) => (
          <div key={tr.id} className="flex items-center gap-2 text-sm p-1.5 border rounded-md bg-background">
            <Badge variant="outline">{tr.from_status_id ? byId.get(tr.from_status_id)?.name ?? "?" : "Любой"}</Badge>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            <Badge>{byId.get(tr.to_status_id)?.name ?? "?"}</Badge>
            <span className="text-muted-foreground">— {tr.name}</span>
            <Button
              size="icon" variant="ghost" className="h-7 w-7 ml-auto text-destructive"
              onClick={() => remove.mutate({ id: tr.id, workflow_id: workflowId })}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-1 border-t">
        <div>
          <Label className="text-xs">Из</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Любой статус</SelectItem>
              {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">В</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Целевой статус" /></SelectTrigger>
            <SelectContent>
              {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">Название действия</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Взять в работу" className="h-8" />
          </div>
          <Button size="sm" className="h-8" onClick={add}><Plus className="w-3.5 h-3.5 mr-1" />Добавить</Button>
        </div>
      </div>
    </div>
  );
};

/* ============ Карточка одного воркфлоу ============ */
const WorkflowCard = ({ wf }: { wf: TrackerWorkflow }) => {
  const update = useUpdateWorkflow();
  const remove = useDeleteWorkflow();
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <Input
                defaultValue={wf.name}
                className="h-8 font-medium"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== wf.name) update.mutate({ id: wf.id, name: v });
                }}
              />
              {wf.description && <p className="text-xs text-muted-foreground mt-1">{wf.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant={wf.is_default ? "default" : "outline"}
              onClick={() => update.mutate({ id: wf.id, is_default: !wf.is_default })}
            >
              {wf.is_default ? "По умолчанию" : "Сделать по умолчанию"}
            </Button>
            <Button
              size="icon" variant="ghost" className="text-destructive"
              onClick={() => {
                if (confirm(`Удалить воркфлоу «${wf.name}»? Проекты потеряют привязку.`)) remove.mutate({ id: wf.id });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Статусы
          </div>
          <StatusesEditor workflowId={wf.id} />
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground mb-2">
            <GitBranch className="w-3.5 h-3.5" />Переходы
          </div>
          <TransitionsEditor workflowId={wf.id} />
        </div>
      </CardContent>
    </Card>
  );
};

/* ============ Страница ============ */
const TrackerWorkflows = () => {
  const { data: workflows = [], isLoading } = useWorkflows();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Воркфлоу</h2>
          <p className="text-sm text-muted-foreground">
            Конструктор статусов и переходов для проектов. Привяжите воркфлоу в карточке проекта.
          </p>
        </div>
        <WorkflowCreateDialog />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : workflows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Воркфлоу ещё нет. Создайте первый — например, «Простой»: К выполнению → В работе → Готово.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => <WorkflowCard key={wf.id} wf={wf} />)}
        </div>
      )}
    </div>
  );
};

export default TrackerWorkflows;
