import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Хранилище правок текстов и цифр инвест-презентации.
 * Правки сохраняются в localStorage. Кнопки Export / Import позволяют
 * поделиться правками с другим устройством.
 */

const STORAGE_KEY = "investor-deck:v1";

type DeckMap = Record<string, string>;

type Ctx = {
  values: DeckMap;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  setValue: (id: string, v: string) => void;
  reset: () => void;
  exportJson: () => string;
  importJson: (raw: string) => boolean;
};

const DeckContentCtx = createContext<Ctx | null>(null);

function readStorage(): DeckMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function DeckContentProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<DeckMap>(() => readStorage());
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      /* ignore quota */
    }
  }, [values]);

  const setValue = useCallback((id: string, v: string) => {
    setValues((prev) => {
      if (prev[id] === v) return prev;
      return { ...prev, [id]: v };
    });
  }, []);

  const reset = useCallback(() => {
    setValues({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const exportJson = useCallback(() => JSON.stringify(values, null, 2), [values]);

  const importJson = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      setValues(parsed as DeckMap);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ values, editMode, setEditMode, setValue, reset, exportJson, importJson }),
    [values, editMode, setValue, reset, exportJson, importJson],
  );

  return <DeckContentCtx.Provider value={value}>{children}</DeckContentCtx.Provider>;
}

export function useDeckCtx(): Ctx {
  const ctx = useContext(DeckContentCtx);
  if (!ctx) throw new Error("DeckContentProvider missing");
  return ctx;
}

export function useDeckValue(id: string, fallback: string): string {
  const { values } = useDeckCtx();
  return values[id] ?? fallback;
}

export function useDeckNumber(id: string, fallback: number): number {
  const raw = useDeckValue(id, String(fallback));
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
