import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Inbox, Columns3, Layers, FolderKanban, Workflow, Target, ListChecks, CalendarClock,
  FolderOpen, Check, Plus, Command,
} from "lucide-react";
import { TrackerProjectProvider, useTrackerProject } from "@/contexts/TrackerProjectContext";
import { useBoardTasks, useProjects } from "@/hooks/tracker";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import InspectorStack from "@/components/workspace/InspectorStack";
import InspectorSection from "@/components/workspace/InspectorSection";
import StatusBar from "@/components/workspace/StatusBar";
import { useDockPanel } from "@/hooks/useDockPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command as CmdRoot, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskDetailBody } from "@/components/tracker/TaskDetailDialog";
import { cn } from "@/lib/utils";

type ViewDef = { to: string; label: string; icon: typeof LayoutDashboard };

const VIEWS: ViewDef[] = [
  { to: "/tracker/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/tracker/my-backlog", label: "Мой бэклог", icon: Inbox },
  { to: "/tracker/board", label: "Доска", icon: Columns3 },
  { to: "/tracker/backlog", label: "Бэклог / Спринты", icon: Layers },
  { to: "/tracker/projects", label: "Проекты", icon: FolderKanban },
  { to: "/tracker/workflows", label: "Воркфлоу", icon: Workflow },
];

const SECONDARY: ViewDef[] = [
  { to: "/tracker/goals", label: "Цели (OKR)", icon: Target },
  { to: "/tracker/tasks", label: "Поручения", icon: ListChecks },
  { to: "/tracker/one-on-ones", label: "Встречи 1:1", icon: CalendarClock },
];

/** Compact project picker for the top toolbar. */
const ProjectPicker = () => {
  const { projectId, setProjectId } = useTrackerProject();
  const { data: projects = [] } = useProjects({ status: "active" });
  const [open, setOpen] = useState(false);

  const current = projects.find((p) => p.id === projectId);
  const label = current ? current.key : "INBOX";
  const name = current ? current.name : "Inbox (без проекта)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 inline-flex items-center gap-2 rounded-md bg-primary/10 text-primary px-2 hover:bg-primary/20 transition-colors"
        >
          <span className="font-mono text-[10px] font-bold">{label.slice(0, 6)}</span>
          <span className="text-[12px] text-foreground/80 max-w-[180px] truncate hidden sm:inline">{name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="p-0 w-72">
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
  );
};

const TabLink = ({ to, label, icon: Icon, active }: ViewDef & { active: boolean }) => (
  <NavLink
    to={to}
    className={cn(
      "h-8 inline-flex items-center gap-1.5 rounded-md px-2.5 text-[12.5px] whitespace-nowrap transition-colors",
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
    )}
  >
    <Icon className="w-3.5 h-3.5" />
    <span>{label}</span>
  </NavLink>
);

const TrackerToolbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="h-12 border-b border-border/60 bg-card/40 backdrop-blur-sm flex items-center gap-2 px-3 overflow-x-auto">
      <ProjectPicker />
      <div className="w-px h-5 bg-border/60 mx-1" />
      <nav className="flex items-center gap-1">
        {VIEWS.map((v) => (
          <TabLink key={v.to} {...v} active={pathname.startsWith(v.to)} />
        ))}
      </nav>
      <div className="w-px h-5 bg-border/60 mx-1" />
      <nav className="flex items-center gap-1">
        {SECONDARY.map((v) => (
          <TabLink key={v.to} {...v} active={pathname.startsWith(v.to)} />
        ))}
      </nav>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => navigate("/tracker/projects")}
            className="h-8 inline-flex items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Новый проект</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>Новый проект</TooltipContent>
      </Tooltip>
    </div>
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
    <TooltipProvider delayDuration={200}>
      <WorkspaceShell
        toolbar={<TrackerToolbar />}
        inspector={inspector}
        statusBar={<TrackerStatusBar />}
      >
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </WorkspaceShell>
    </TooltipProvider>
  );
};

const TrackerLayout = () => (
  <TrackerProjectProvider>
    <TrackerShell />
  </TrackerProjectProvider>
);

export default TrackerLayout;
