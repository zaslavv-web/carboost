import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, useDroppable,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useBoardTasks, useMoveTask, useCreateTask, BOARD_COLUMNS,
  useProject, useWorkflowStatuses,
  type TrackerTask, type TaskStatus, type TrackerWorkflowStatus,
} from "@/hooks/tracker";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import { useEmployeeNameMap } from "@/components/tracker/EmployeePicker";
import { UrgencyBadge } from "@/components/tracker/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, User, Hash, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { TaskDetailDialog } from "@/components/tracker/TaskDetailDialog";

/* ============ Унифицированное описание колонки ============ */
type ColumnDef = {
  id: string;                                   // ключ колонки (либо TaskStatus, либо workflow_status_id)
  label: string;
  matches: (t: TrackerTask) => boolean;         // условие принадлежности задачи
  applyDrop: (t: TrackerTask) => Partial<TrackerTask>; // что записать в задачу при дропе
};

/* ============ Карточка ============ */
const TaskCard = ({ task, nameMap, onOpen }: { task: TrackerTask; nameMap: Map<string, string>; onOpen: (t: TrackerTask) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id, data: { type: "task", task },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing"
        onClick={(e) => {
          // Открываем диалог только если это не drag — у dnd-kit при простом клике transform=null
          if (!isDragging) onOpen(task);
        }}
      >
        <CardContent className="p-3 space-y-2">
          <div className="text-sm leading-snug">{task.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <UrgencyBadge urgency={task.urgency} />
            {task.story_points != null && (
              <Badge variant="outline" className="gap-1 h-5 px-1.5 font-mono">
                <Hash className="w-3 h-3" />{task.story_points}
              </Badge>
            )}
            {task.due_at && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3 h-3" />{format(new Date(task.due_at), "dd.MM")}
              </span>
            )}
            {task.assignee_id && (
              <span className="inline-flex items-center gap-1 text-muted-foreground ml-auto max-w-[140px] truncate">
                <User className="w-3 h-3" />{nameMap.get(task.assignee_id) ?? "—"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/* ============ Колонка ============ */
const Column = ({
  column, tasks, nameMap, onQuickAdd, onOpenTask,
}: {
  column: ColumnDef; tasks: TrackerTask[]; nameMap: Map<string, string>;
  onQuickAdd: (column: ColumnDef, title: string) => void;
  onOpenTask: (t: TrackerTask) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}`, data: { type: "column", columnId: column.id } });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    onQuickAdd(column, title.trim());
    setTitle(""); setAdding(false);
  };
  return (
    <div className="flex flex-col min-w-[280px] w-[280px] bg-muted/40 rounded-lg p-2">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {column.label} <span className="ml-1 text-foreground/70">{tasks.length}</span>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAdding((v) => !v)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={"flex-1 space-y-2 px-1 pt-1 pb-2 min-h-[80px] rounded-md " + (isOver ? "bg-primary/5 ring-1 ring-primary/30" : "")}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} nameMap={nameMap} onOpen={onOpenTask} />)}
        </SortableContext>
        {adding && (
          <div className="space-y-1.5 p-1">
            <Input
              autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setTitle(""); }
              }}
              placeholder="Название задачи и Enter" className="h-8 text-sm"
            />
            <div className="flex gap-1">
              <Button size="sm" className="h-7" onClick={submit}>Создать</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAdding(false); setTitle(""); }}>Отмена</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============ Помощники ============ */
function buildLegacyColumns(): ColumnDef[] {
  return BOARD_COLUMNS.map((c) => ({
    id: c.status,
    label: c.label,
    matches: (t) => t.status === c.status,
    applyDrop: () => ({ status: c.status }),
  }));
}

function buildWorkflowColumns(statuses: TrackerWorkflowStatus[]): ColumnDef[] {
  const initial = statuses.find((s) => s.is_initial) ?? statuses[0];
  return statuses.map((s) => ({
    id: s.id,
    label: s.name,
    matches: (t) => {
      if (t.workflow_status_id) return t.workflow_status_id === s.id;
      return !!initial && s.id === initial.id; // задачи без статуса попадают в стартовый
    },
    applyDrop: () => ({
      workflow_status_id: s.id,
      // зеркалим в enum status — для дашбордов и старых отчётов
      status: s.category === "done" ? "done" : s.category === "in_progress" ? "published" : "draft",
    }),
  }));
}

/* ============ Доска ============ */
const TrackerBoard = () => {
  const { projectId } = useTrackerProject();
  const { data: project } = useProject(projectId ?? undefined);
  const { data: workflowStatuses = [] } = useWorkflowStatuses(project?.workflow_id ?? undefined);
  const { data: tasks = [], isLoading } = useBoardTasks(projectId);
  const move = useMoveTask();
  const createTask = useCreateTask();
  const nameMap = useEmployeeNameMap();

  const projectKey = projectId ?? "inbox";
  const useWorkflow = !!project?.workflow_id && workflowStatuses.length > 0;

  const columnDefs = useMemo<ColumnDef[]>(
    () => (useWorkflow ? buildWorkflowColumns(workflowStatuses) : buildLegacyColumns()),
    [useWorkflow, workflowStatuses]
  );

  const columns = useMemo(() => {
    const map: Record<string, TrackerTask[]> = {};
    columnDefs.forEach((c) => (map[c.id] = []));
    tasks.forEach((t) => {
      const target = columnDefs.find((c) => c.matches(t));
      if (target) map[target.id].push(t);
    });
    return map;
  }, [tasks, columnDefs]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeTask, setActiveTask] = useState<TrackerTask | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    setActiveTask(tasks.find((x) => x.id === e.active.id) ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;

    const activeTaskObj = tasks.find((t) => t.id === active.id);
    if (!activeTaskObj) return;

    const overData = over.data.current as any;
    let targetColId: string | null = null;
    let targetIndex = 0;

    if (overData?.type === "column") {
      targetColId = overData.columnId;
      targetIndex = (columns[targetColId!]?.length ?? 0);
    } else if (overData?.type === "task") {
      const overTask = overData.task as TrackerTask;
      const col = columnDefs.find((c) => c.matches(overTask));
      if (!col) return;
      targetColId = col.id;
      const list = columns[targetColId] ?? [];
      targetIndex = list.findIndex((t) => t.id === overTask.id);
      if (targetIndex < 0) targetIndex = list.length;
    } else return;

    const targetCol = columnDefs.find((c) => c.id === targetColId);
    if (!targetCol) return;

    const targetList = (columns[targetColId!] ?? []).filter((t) => t.id !== active.id);
    const before = targetList[targetIndex - 1];
    const after = targetList[targetIndex];
    let newOrder: number;
    if (before && after) newOrder = (Number(before.order_index) + Number(after.order_index)) / 2;
    else if (before) newOrder = Number(before.order_index) + 1024;
    else if (after) newOrder = Number(after.order_index) - 1024;
    else newOrder = 1024;

    const drop = targetCol.applyDrop(activeTaskObj);
    const sameColumn = columnDefs.find((c) => c.matches(activeTaskObj))?.id === targetColId;
    if (sameColumn && Math.abs(newOrder - Number(activeTaskObj.order_index)) < 0.0001) return;

    await move.mutateAsync({
      id: activeTaskObj.id,
      status: drop.status as TaskStatus | undefined,
      workflow_status_id: drop.workflow_status_id as string | undefined,
      order_index: newOrder,
      projectKey,
    });
  };

  const handleQuickAdd = async (column: ColumnDef, title: string) => {
    const list = columns[column.id] ?? [];
    const maxOrder = Math.max(0, ...list.map((t) => Number(t.order_index) || 0));
    const drop = column.applyDrop({} as TrackerTask);
    await createTask.mutateAsync({
      title,
      project_id: projectId ?? null,
      order_index: maxOrder + 1024,
      status: (drop.status as TaskStatus) ?? "draft",
      workflow_status_id: (drop.workflow_status_id as string | undefined) ?? null,
    } as any);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка доски…</p>;

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <FolderKanban className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Выбран Inbox. Доска работает для отдельного проекта — создайте проект и переключитесь на него.
          </p>
          <Button asChild><Link to="/tracker/projects">К проектам</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {useWorkflow ? (
        <div className="text-xs text-muted-foreground">
          Воркфлоу: <span className="text-foreground font-medium">{workflowStatuses.length} статусов</span> · настраивается на странице «Воркфлоу».
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Стандартные колонки. Привяжите воркфлоу к проекту, чтобы настроить статусы под процесс.{" "}
          <Link to="/tracker/workflows" className="text-primary underline">Перейти</Link>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2">
          {columnDefs.map((c) => (
            <Column key={c.id} column={c} tasks={columns[c.id] ?? []} nameMap={nameMap} onQuickAdd={handleQuickAdd} />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="w-[260px]">
              <Card className="shadow-lg ring-1 ring-primary/40">
                <CardContent className="p-3 text-sm">{activeTask.title}</CardContent>
              </Card>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default TrackerBoard;
