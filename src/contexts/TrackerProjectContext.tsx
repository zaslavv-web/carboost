import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from "react";
import type { TrackerTask } from "@/hooks/tracker";

type Ctx = {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  inspectorTask: TrackerTask | null;
  openInspector: (task: TrackerTask) => void;
  closeInspector: () => void;
};

const TrackerProjectContext = createContext<Ctx | null>(null);
const LS_KEY = "tracker.activeProjectId";

export const TrackerProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projectId, setProjectIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  });
  const setProjectId = (id: string | null) => {
    setProjectIdState(id);
    try {
      if (id) localStorage.setItem(LS_KEY, id);
      else localStorage.removeItem(LS_KEY);
    } catch {/* ignore */}
  };

  const [inspectorTask, setInspectorTask] = useState<TrackerTask | null>(null);
  const openInspector = useCallback((task: TrackerTask) => setInspectorTask(task), []);
  const closeInspector = useCallback(() => setInspectorTask(null), []);

  useEffect(() => {/* placeholder for future sync */}, []);

  return (
    <TrackerProjectContext.Provider
      value={{ projectId, setProjectId, inspectorTask, openInspector, closeInspector }}
    >
      {children}
    </TrackerProjectContext.Provider>
  );
};

export const useTrackerProject = () => {
  const ctx = useContext(TrackerProjectContext);
  if (!ctx) throw new Error("useTrackerProject must be inside TrackerProjectProvider");
  return ctx;
};
