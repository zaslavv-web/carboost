import { useState } from "react";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import {
  useSprints, useBacklog, useSprintTasks,
  useCreateSprint, useStartSprint, useCompleteSprint, useDeleteSprint, useUpdateSprint,
  useAssignTaskToSprint, useCreateTask,
  type TrackerSprint, type TrackerTask,
} from "@/hooks/tracker";
import { useEmployeeNameMap } from "@/components/tracker/EmployeePicker";
import { UrgencyBadge } from "@/components/tracker/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Play, CheckCircle2, Trash2, FolderKanban, Hash, Calendar, User, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { TaskDetailDialog } from "@/components/tracker/TaskDetailDialog";

/* ============ Карточка задачи (компактная) ============ */
const TaskRow = ({
  task, nameMap, actions, onOpen,
}: { task: TrackerTask; nameMap: Map<string, string>; actions?: React.ReactNode; onOpen?: (t: TrackerTask) => void }) => (
  <div className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-border hover:bg-muted/40">
    <span className="text-xs font-mono text-muted-foreground uppercase">{task.type}</span>
    <button
      type="button"
      className="text-sm flex-1 truncate text-left hover:underline"
      onClick={() => onOpen?.(task)}
    >
      {task.title}
    </button>
    <UrgencyBadge urgency={task.urgency} />
    {task.story_points != null && (
      <Badge variant="outline" className="gap-1 h-5 px-1.5 font-mono text-xs">
        <Hash className="w-3 h-3" />{task.story_points}
      </Badge>
    )}
    {task.due_at && (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="w-3 h-3" />{format(new Date(task.due_at), "dd.MM")}
      </span>
    )}
    {task.assignee_id && (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-w-[140px] truncate">
        <User className="w-3 h-3" />{nameMap.get(task.assignee_id) ?? "—"}
      </span>
    )}
    {actions}
  </div>
);

/* ============ Sprint Section ============ */
const SprintSection = ({
  sprint, projectId, sprints, nameMap, onOpen,
}: {
  sprint: TrackerSprint; projectId: string;
  sprints: TrackerSprint[]; nameMap: Map<string, string>;
  onOpen: (t: TrackerTask) => void;
}) => {
  const { data: tasks = [] } = useSprintTasks(sprint.id);
  const startSprint = useStartSprint();
  const completeSprint = useCompleteSprint();
  const deleteSprint = useDeleteSprint();
  const updateSprint = useUpdateSprint();
  const assign = useAssignTaskToSprint();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string>("backlog");
  const [endDate, setEndDate] = useState<string>("");

  const totalPoints = tasks.reduce((s, t) => s + (Number(t.story_points) || 0), 0);
  const donePoints = tasks
    .filter((t) => t.status === "done")
    .reduce((s, t) => s + (Number(t.story_points) || 0), 0);

  const nextPlanned = sprints.find((s) => s.id !== sprint.id && s.status === "planned");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{sprint.name}</CardTitle>
              <Badge
                variant={sprint.status === "active" ? "default" : sprint.status === "completed" ? "secondary" : "outline"}
                className="uppercase text-[10px]"
              >
                {sprint.status === "planned" ? "запланирован" : sprint.status === "active" ? "активен" : "завершён"}
              </Badge>
              {sprint.start_date && sprint.end_date && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(sprint.start_date), "dd.MM")} — {format(new Date(sprint.end_date), "dd.MM.yyyy")}
                </span>
              )}
            </div>
            {sprint.goal && <p className="text-xs text-muted-foreground max-w-2xl">{sprint.goal}</p>}
            <div className="text-xs text-muted-foreground">
              Задач: <span className="font-medium text-foreground">{tasks.length}</span> ·
              {" "}SP выполнено: <span className="font-medium text-foreground">{donePoints}/{totalPoints}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            {sprint.status === "planned" && (
              <Button size="sm" onClick={() => startSprint.mutate({ id: sprint.id, project_id: projectId })} disabled={tasks.length === 0}>
                <Play className="w-3.5 h-3.5 mr-1" /> Старт
              </Button>
            )}
            {sprint.status === "active" && (
              <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Завершить
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Завершить спринт «{sprint.name}»</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    <p>Куда перенести невыполненные задачи?</p>
                    <Select value={moveTo} onValueChange={setMoveTo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">В бэклог</SelectItem>
                        {sprints.filter((s) => s.status === "planned").map((s) => (
                          <SelectItem key={s.id} value={s.id}>В спринт «{s.name}»</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setCompleteOpen(false)}>Отмена</Button>
                    <Button onClick={async () => {
                      await completeSprint.mutateAsync({
                        id: sprint.id, project_id: projectId,
                        moveUnfinishedToSprintId: moveTo === "backlog" ? null : moveTo,
                      });
                      setCompleteOpen(false);
                    }}>Завершить</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {sprint.status === "planned" && (
              <Button size="icon" variant="ghost" className="h-8 w-8"
                onClick={() => {
                  if (confirm(`Удалить спринт «${sprint.name}»? Задачи вернутся в бэклог.`)) {
                    // Сначала вернуть задачи в бэклог
                    Promise.all(tasks.map((t) => assign.mutateAsync({ taskId: t.id, sprintId: null, projectId })))
                      .then(() => deleteSprint.mutate({ id: sprint.id, project_id: projectId }));
                  }
                }}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        {sprint.status === "active" && !sprint.end_date && (
          <div className="flex items-center gap-2 pt-2">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-44 text-xs" />
            <Button size="sm" variant="outline" disabled={!endDate}
              onClick={() => updateSprint.mutate({ id: sprint.id, end_date: new Date(endDate).toISOString() } as any)}>
              Задать дедлайн
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">Задач пока нет — перетащите из бэклога или используйте «В спринт».</p>
        ) : (
          <div className="border-t border-border">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} nameMap={nameMap} onOpen={onOpen}
                actions={sprint.status !== "completed" ? (
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    title="В бэклог"
                    onClick={() => assign.mutate({ taskId: t.id, sprintId: null, projectId })}>
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                  </Button>
                ) : null}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ============ Backlog Section ============ */
const BacklogSection = ({
  projectId, sprints, nameMap, onOpen,
}: { projectId: string; sprints: TrackerSprint[]; nameMap: Map<string, string>; onOpen: (t: TrackerTask) => void }) => {
  const { data: backlog = [], isLoading } = useBacklog(projectId);
  const assign = useAssignTaskToSprint();
  const createTask = useCreateTask();
  const [newTitle, setNewTitle] = useState("");
  const [defaultSprint, setDefaultSprint] = useState<string>("backlog");

  const openSprints = sprints.filter((s) => s.status !== "completed");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Бэклог · {backlog.length}</CardTitle>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Input
            placeholder="Новая задача в бэклог…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                createTask.mutate({
                  title: newTitle.trim(),
                  project_id: projectId,
                  sprint_id: defaultSprint === "backlog" ? null : defaultSprint,
                  status: "draft",
                } as any);
                setNewTitle("");
              }
            }}
            className="h-9 text-sm flex-1 min-w-[200px]"
          />
          <Select value={defaultSprint} onValueChange={setDefaultSprint}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="backlog">В бэклог</SelectItem>
              {openSprints.map((s) => (
                <SelectItem key={s.id} value={s.id}>В «{s.name}»</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!newTitle.trim()} onClick={() => {
            createTask.mutate({
              title: newTitle.trim(),
              project_id: projectId,
              sprint_id: defaultSprint === "backlog" ? null : defaultSprint,
              status: "draft",
            } as any);
            setNewTitle("");
          }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Добавить
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-4">Загрузка…</p>
        ) : backlog.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4">Бэклог пуст.</p>
        ) : (
          <div className="border-t border-border">
            {backlog.map((t) => (
              <TaskRow key={t.id} task={t} nameMap={nameMap} onOpen={onOpen}
                actions={openSprints.length > 0 ? (
                  <Select onValueChange={(sprintId) => assign.mutate({ taskId: t.id, sprintId, projectId })}>
                    <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="В спринт →" /></SelectTrigger>
                    <SelectContent>
                      {openSprints.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ============ Create Sprint Dialog ============ */
const CreateSprintDialog = ({ projectId }: { projectId: string }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const create = useCreateSprint();

  const submit = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      project_id: projectId,
      name: name.trim(),
      goal: goal.trim() || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
    });
    setOpen(false); setName(""); setGoal(""); setStartDate(""); setEndDate("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Новый спринт</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Создать спринт</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Название</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 12" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Цель спринта</label>
            <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Что хотим достичь" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Старт</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Финиш</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={submit} disabled={!name.trim()}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ============ Page ============ */
const TrackerBacklog = () => {
  const { projectId } = useTrackerProject();
  const { data: sprints = [], isLoading } = useSprints(projectId);
  const nameMap = useEmployeeNameMap();
  const [openTask, setOpenTask] = useState<TrackerTask | null>(null);

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <FolderKanban className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Выберите проект — бэклог и спринты живут внутри проекта.
          </p>
          <Button asChild><Link to="/tracker/projects">К проектам</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const active = sprints.filter((s) => s.status === "active");
  const planned = sprints.filter((s) => s.status === "planned");
  const completed = sprints.filter((s) => s.status === "completed").slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Бэклог и спринты</h2>
          <p className="text-xs text-muted-foreground">Scrum-планирование: спринты, цели, дедлайны и перенос невыполненных задач.</p>
        </div>
        <CreateSprintDialog projectId={projectId} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Загрузка спринтов…</p>}

      {active.map((s) => (
        <SprintSection key={s.id} sprint={s} projectId={projectId} sprints={sprints} nameMap={nameMap} onOpen={setOpenTask} />
      ))}
      {planned.map((s) => (
        <SprintSection key={s.id} sprint={s} projectId={projectId} sprints={sprints} nameMap={nameMap} onOpen={setOpenTask} />
      ))}

      <BacklogSection projectId={projectId} sprints={sprints} nameMap={nameMap} onOpen={setOpenTask} />

      {completed.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="px-4 py-2 cursor-pointer text-sm font-medium">
            Завершённые спринты ({completed.length})
          </summary>
          <div className="space-y-3 p-3">
            {completed.map((s) => (
              <SprintSection key={s.id} sprint={s} projectId={projectId} sprints={sprints} nameMap={nameMap} onOpen={setOpenTask} />
            ))}
          </div>
        </details>
      )}

      <TaskDetailDialog task={openTask} open={!!openTask} onOpenChange={(v) => !v && setOpenTask(null)} />
    </div>
  );
};

export default TrackerBacklog;
