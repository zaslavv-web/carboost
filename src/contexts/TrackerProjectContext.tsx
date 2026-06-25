import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Ctx = {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
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
  useEffect(() => {/* placeholder for future sync */}, []);
  return (
    <TrackerProjectContext.Provider value={{ projectId, setProjectId }}>
      {children}
    </TrackerProjectContext.Provider>
  );
};

export const useTrackerProject = () => {
  const ctx = useContext(TrackerProjectContext);
  if (!ctx) throw new Error("useTrackerProject must be inside TrackerProjectProvider");
  return ctx;
};
