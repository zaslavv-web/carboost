import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, useDroppable,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useBoardTasks, useMoveTask, useCreateTask, BOARD_COLUMNS,
  type TrackerTask, type TaskStatus,
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

/* ============ Карточка ============ */
const TaskCard = ({ task, projectKey, nameMap }: { task: TrackerTask; projectKey: string; nameMap: Map<string, string> }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing">
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
  status, label, tasks, projectKey, nameMap, onQuickAdd,
}: {
  status: TaskStatus; label: string; tasks: TrackerTask[];
  projectKey: string; nameMap: Map<string, string>;
  onQuickAdd: (status: TaskStatus, title: string) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { type: "column", status } });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    onQuickAdd(status, title.trim());
    setTitle("");
    setAdding(false);
  };
  return (
    <div className="flex flex-col min-w-[280px] w-[280px] bg-muted/40 rounded-lg p-2">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} <span className="ml-1 text-foreground/70">{tasks.length}</span>
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
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} projectKey={projectKey} nameMap={nameMap} />
          ))}
        </SortableContext>
        {adding && (
          <div className="space-y-1.5 p-1">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setTitle(""); }
              }}
              placeholder="Название задачи и Enter"
              className="h-8 text-sm"
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

/* ============ Доска ============ */
const TrackerBoard = () => {
  const { projectId } = useTrackerProject();
  const { data: tasks = [], isLoading } = useBoardTasks(projectId);
  const move = useMoveTask();
  const createTask = useCreateTask();
  const nameMap = useEmployeeNameMap();

  const projectKey = projectId ?? "inbox";

  const columns = useMemo(() => {
    const map: Record<TaskStatus, TrackerTask[]> = {} as any;
    BOARD_COLUMNS.forEach((c) => (map[c.status] = []));
    tasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeTask, setActiveTask] = useState<TrackerTask | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const t = tasks.find((x) => x.id === e.active.id);
    setActiveTask(t ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;

    const activeTaskObj = tasks.find((t) => t.id === active.id);
    if (!activeTaskObj) return;

    // Resolve target status + position
    const overData = over.data.current as any;
    let targetStatus: TaskStatus = activeTaskObj.status;
    let targetIndex = 0;

    if (overData?.type === "column") {
      targetStatus = overData.status;
      targetIndex = (columns[targetStatus]?.length ?? 0);
    } else if (overData?.type === "task") {
      const overTask = overData.task as TrackerTask;
      targetStatus = overTask.status;
      const list = columns[targetStatus] ?? [];
      targetIndex = list.findIndex((t) => t.id === overTask.id);
      if (targetIndex < 0) targetIndex = list.length;
    } else {
      return;
    }

    // Compute new order_index using neighbours in target list
    const targetList = (columns[targetStatus] ?? []).filter((t) => t.id !== active.id);
    const before = targetList[targetIndex - 1];
    const after = targetList[targetIndex];
    let newOrder: number;
    if (before && after) newOrder = (Number(before.order_index) + Number(after.order_index)) / 2;
    else if (before) newOrder = Number(before.order_index) + 1024;
    else if (after) newOrder = Number(after.order_index) - 1024;
    else newOrder = 1024;

    if (targetStatus === activeTaskObj.status && Math.abs(newOrder - Number(activeTaskObj.order_index)) < 0.0001) return;

    await move.mutateAsync({
      id: activeTaskObj.id,
      status: targetStatus,
      order_index: newOrder,
      projectKey,
    });
  };

  const handleQuickAdd = async (status: TaskStatus, title: string) => {
    const maxOrder = Math.max(0, ...(columns[status] ?? []).map((t) => Number(t.order_index) || 0));
    await createTask.mutateAsync({
      title,
      status,
      project_id: projectId ?? null,
      order_index: maxOrder + 1024,
    } as any);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка доски…</p>;
  }

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
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2">
        {BOARD_COLUMNS.map((c) => (
          <Column
            key={c.status}
            status={c.status}
            label={c.label}
            tasks={columns[c.status] ?? []}
            projectKey={projectKey}
            nameMap={nameMap}
            onQuickAdd={handleQuickAdd}
          />
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
  );
};

export default TrackerBoard;
