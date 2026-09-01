import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from "react";
import type { TrackerTask } from "@/hooks/tracker";
import { useProject } from "@/hooks/tracker";

type Ctx = {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  inspectorTask: TrackerTask | null;
  openInspector: (task: TrackerTask) => void;
  closeInspector: () => void;
};

const TrackerProjectContext = createContext<Ctx | null>(null);
const LS_KEY = "tracker.activeProjectId";

/**
 * Сброс «мёртвого» активного проекта.
 *
 * Выбранный проект живёт в localStorage и переживает всё: удаление самого
 * проекта, смену компании, выход из аккаунта. Пока никто не проверял, что он
 * ещё существует, такой id продолжал фильтровать данные вслепую: пикер не
 * находил проект в списке и показывал «Inbox», а задачи запрашивались по
 * несуществующему project_id — доска выглядела пустой без единого объяснения,
 * и каждая страница трекера стучалась в 404.
 */
const StaleProjectGuard = ({
  projectId,
  onStale,
}: {
  projectId: string | null;
  onStale: () => void;
}) => {
  const { data, isSuccess } = useProject(projectId ?? undefined);

  useEffect(() => {
    // null приходит только от успешного ответа «записи нет» — сетевой сбой
    // сюда не попадает и выбор пользователя не сбрасывает.
    if (projectId && isSuccess && data === null) onStale();
  }, [projectId, isSuccess, data, onStale]);

  return null;
};

export const TrackerProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projectId, setProjectIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  });
  const setProjectId = useCallback((id: string | null) => {
    setProjectIdState(id);
    try {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    } catch {/* ignore */}
  }, []);

  const dropStaleProject = useCallback(() => setProjectId(null), [setProjectId]);

  const [inspectorTask, setInspectorTask] = useState<TrackerTask | null>(null);
  const openInspector = useCallback((task: TrackerTask) => setInspectorTask(task), []);
  const closeInspector = useCallback(() => setInspectorTask(null), []);

  return (
    <TrackerProjectContext.Provider
      value={{ projectId, setProjectId, inspectorTask, openInspector, closeInspector }}
    >
      <StaleProjectGuard projectId={projectId} onStale={dropStaleProject} />
      {children}
    </TrackerProjectContext.Provider>
  );
};

export const useTrackerProject = () => {
  const ctx = useContext(TrackerProjectContext);
  if (!ctx) throw new Error("useTrackerProject must be inside TrackerProjectProvider");
  return ctx;
};
