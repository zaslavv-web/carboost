import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Inbox, Columns3, Layers, FolderKanban, Workflow, Target, ListChecks, CalendarClock,
  FolderOpen, Check, Plus, Command,
} from "lucide-react";
import { TrackerProjectProvider, useTrackerProject } from "@/contexts/TrackerProjectContext";
import { useBoardTasks, useProjects } from "@/hooks/tracker";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import ContextRail, { type RailItem } from "@/components/workspace/ContextRail";
import InspectorStack from "@/components/workspace/InspectorStack";
import InspectorSection from "@/components/workspace/InspectorSection";
import StatusBar from "@/components/workspace/StatusBar";
import { useDockPanel } from "@/hooks/useDockPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command as CmdRoot, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskDetailBody } from "@/components/tracker/TaskDetailDialog";
import { Button } from "@/components/ui/button";

const VIEWS: { to: string; label: string; icon: RailItem["icon"] }[] = [
  { to: "/tracker/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/tracker/my-backlog", label: "Мой бэклог", icon: Inbox },
  { to: "/tracker/board", label: "Доска", icon: Columns3 },
  { to: "/tracker/backlog", label: "Бэклог / Спринты", icon: Layers },
  { to: "/tracker/projects", label: "Проекты", icon: FolderKanban },
  { to: "/tracker/workflows", label: "Воркфлоу", icon: Workflow },
];

const SECONDARY: { to: string; label: string; icon: RailItem["icon"] }[] = [
  { to: "/tracker/goals", label: "Цели (OKR)", icon: Target },
  { to: "/tracker/tasks", label: "Поручения", icon: ListChecks },
  { to: "/tracker/one-on-ones", label: "Встречи 1:1", icon: CalendarClock },
];

/** Project picker that lives on top of the rail (Figma-style "file" badge). */
const ProjectRailPicker = () => {
  const { projectId, setProjectId } = useTrackerProject();
  const { data: projects = [] } = useProjects({ status: "active" });
  const [open, setOpen] = useState(false);

  const current = projects.find((p) => p.id === projectId);
  const label = current ? current.key : "INBOX";

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-9 h-9 mx-auto rounded-md bg-primary/10 text-primary font-mono text-[10px] font-bold flex items-center justify-center hover:bg-primary/20 transition-colors"
              >
                {label.slice(0, 4)}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            {current ? current.name : "Inbox (без проекта)"}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" className="p-0 w-72">
          <CmdRoot>
            <CommandInput placeholder="Найти проект…" />
            <CommandList>
              <CommandEmpty>Проекты не найдены.</CommandEmpty>
              <CommandGroup heading="Контекст">
                <CommandItem
                  value="__inbox__ inbox без проекта"
                  onSelect={() => { setProjectId(null); setOpen(false); }}
                >
                  <Inbox className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="flex-1">Inbox (без проекта)</span>
                  {!projectId && <Check className="w-4 h-4 text-primary" />}
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Проекты">
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.key} ${p.name}`}
                    onSelect={() => { setProjectId(p.id); setOpen(false); }}
                  >
                    <FolderOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span className="font-mono text-[11px] text-muted-foreground mr-2">{p.key}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    {projectId === p.id && <Check className="w-4 h-4 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CmdRoot>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};

/** Right inspector contents — task properties (status, assignee, dates) + activity tabs. */
const TaskInspectorContent = ({ taskId }: { taskId: string }) => {
  const { inspectorTask } = useTrackerProject();
  if (!inspectorTask || inspectorTask.id !== taskId) return null;
  return (
    <>
      <InspectorSection title="Свойства" dense>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-[12px]">
          <div className="text-muted-foreground">Статус</div>
          <div className="col-span-2 font-medium">{inspectorTask.status}</div>
          <div className="text-muted-foreground">Срочность</div>
          <div className="col-span-2 font-medium">{inspectorTask.urgency}</div>
          {inspectorTask.story_points != null && (
            <>
              <div className="text-muted-foreground">SP</div>
              <div className="col-span-2 font-mono">{inspectorTask.story_points}</div>
            </>
          )}
          {inspectorTask.due_at && (
            <>
              <div className="text-muted-foreground">Дедлайн</div>
              <div className="col-span-2">{new Date(inspectorTask.due_at).toLocaleString("ru-RU")}</div>
            </>
          )}
        </div>
      </InspectorSection>
      <InspectorSection title="Описание и активность">
        <TaskDetailBody task={inspectorTask} />
      </InspectorSection>
    </>
  );
};

const TrackerStatusBar = () => {
  const { projectId, inspectorTask } = useTrackerProject();
  const { data: tasks = [] } = useBoardTasks(projectId);
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "archived").length;
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at) < new Date() && t.status !== "done").length;

  return (
    <StatusBar
      left={
        <>
          <span>Открытых: <span className="text-foreground font-semibold">{open}</span></span>
          <span>Просрочено: <span className={overdue > 0 ? "text-destructive font-semibold" : "text-foreground"}>{overdue}</span></span>
        </>
      }
      center={inspectorTask ? <span className="truncate">Выделено: {inspectorTask.title}</span> : null}
      right={
        <>
          <span className="inline-flex items-center gap-1"><Command className="w-3 h-3" />K — команды</span>
          <span>[ ] — инспектор</span>
        </>
      }
    />
  );
};

const TrackerShell = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { inspectorTask, closeInspector } = useTrackerProject();
  const dock = useDockPanel("tracker.inspector", { defaultWidth: 360, minWidth: 280, maxWidth: 520 });

  // Auto-open inspector when a task gets selected; user can still collapse via the chevron.
  useEffect(() => {
    if (inspectorTask && dock.collapsed) dock.setCollapsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorTask?.id]);

  // Hotkeys: [ / ] to toggle inspector, Esc to close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.matches?.("input, textarea, [contenteditable='true']")) return;
      if (e.key === "[" || e.key === "]") { e.preventDefault(); dock.toggle(); }
      if (e.key === "Escape" && inspectorTask) closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock, inspectorTask, closeInspector]);

  const primary: RailItem[] = VIEWS.map((v) => ({
    to: v.to,
    label: v.label,
    icon: v.icon,
    active: pathname.startsWith(v.to),
  }));
  const secondary: RailItem[] = SECONDARY.map((v) => ({
    to: v.to, label: v.label, icon: v.icon, active: pathname.startsWith(v.to),
  }));

  const rail = (
    <ContextRail
      topSlot={<ProjectRailPicker />}
      primary={primary}
      secondary={secondary}
      bottomSlot={
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate("/tracker/projects")}
              className="w-9 h-9 mx-auto rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
            >
              <Plus className="w-[18px] h-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>Новый проект</TooltipContent>
        </Tooltip>
      }
    />
  );

  const inspector = (
    <InspectorStack
      title={inspectorTask ? <span>{inspectorTask.title}</span> : null}
      width={dock.rawWidth}
      collapsed={dock.collapsed}
      onToggleCollapsed={dock.toggle}
      resizeHandle={dock.resizeHandle}
      onClose={inspectorTask ? closeInspector : undefined}
      empty={
        <>
          Кликните по задаче на доске, чтобы её свойства появились здесь.
          <br />
          <span className="opacity-70">Hotkey: <kbd className="px-1">[</kbd> свернуть · <kbd className="px-1">]</kbd> развернуть</span>
        </>
      }
    >
      {inspectorTask ? <TaskInspectorContent taskId={inspectorTask.id} /> : null}
    </InspectorStack>
  );

  return (
    <WorkspaceShell
      rail={rail}
      inspector={<TooltipProvider delayDuration={200}>{inspector}</TooltipProvider>}
      statusBar={<TrackerStatusBar />}
    >
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
        <Outlet />
      </div>
    </WorkspaceShell>
  );
};

const TrackerLayout = () => (
  <TrackerProjectProvider>
    <TrackerShell />
  </TrackerProjectProvider>
);

export default TrackerLayout;
