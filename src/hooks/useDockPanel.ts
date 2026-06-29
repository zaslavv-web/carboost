import { useCallback, useEffect, useRef, useState } from "react";

export interface DockState {
  width: number;
  collapsed: boolean;
}

interface Options {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Persistent dockable-panel state (width + collapsed) — Figma/PS-style palettes.
 * State is keyed in localStorage so each user keeps their own workspace layout.
 */
export function useDockPanel(key: string, opts: Options = {}) {
  const { defaultWidth = 320, minWidth = 240, maxWidth = 560 } = opts;
  const storageKey = `workspace:${key}`;

  const [state, setState] = useState<DockState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DockState>;
        return {
          width: Math.min(Math.max(parsed.width ?? defaultWidth, minWidth), maxWidth),
          collapsed: !!parsed.collapsed,
        };
      }
    } catch { /* ignore */ }
    return { width: defaultWidth, collapsed: false };
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [storageKey, state]);

  const setWidth = useCallback((w: number) => {
    setState((s) => ({ ...s, width: Math.min(Math.max(w, minWidth), maxWidth) }));
  }, [minWidth, maxWidth]);

  const toggle = useCallback(() => setState((s) => ({ ...s, collapsed: !s.collapsed })), []);
  const setCollapsed = useCallback((c: boolean) => setState((s) => ({ ...s, collapsed: c })), []);

  /** Returns drag handle bindings for a vertical resizer between canvas and panel. */
  const startResize = useRef<{ x: number; w: number } | null>(null);
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startResize.current = { x: e.clientX, w: state.width };
  }, [state.width]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!startResize.current) return;
    const dx = startResize.current.x - e.clientX; // inspector is on the right → drag left grows it
    setWidth(startResize.current.w + dx);
  }, [setWidth]);

  const onResizeEnd = useCallback((e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    startResize.current = null;
  }, []);

  return {
    width: state.collapsed ? 32 : state.width,
    rawWidth: state.width,
    collapsed: state.collapsed,
    setWidth,
    setCollapsed,
    toggle,
    resizeHandle: { onPointerDown: onResizeStart, onPointerMove: onResizeMove, onPointerUp: onResizeEnd },
  };
}
