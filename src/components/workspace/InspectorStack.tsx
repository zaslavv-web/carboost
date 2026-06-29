import { ReactNode } from "react";
import { PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: ReactNode;
  width: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  resizeHandle: React.HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
  empty?: ReactNode;
  children?: ReactNode;
}

/**
 * Right-docked inspector with drag-resize and collapse-to-strip behaviour.
 * Mirrors Figma's right panel + Photoshop's palette dock.
 */
const InspectorStack = ({
  title, width, collapsed, onToggleCollapsed, resizeHandle, onClose, empty, children,
}: Props) => {
  if (collapsed) {
    return (
      <aside className="w-8 shrink-0 bg-card border-l border-border/60 flex flex-col items-center py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
          aria-label="Развернуть инспектор"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <div className="flex shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        className="w-1 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
        {...resizeHandle}
      />
      <aside
        style={{ width }}
        className="bg-card border-l border-border/60 flex flex-col min-w-0"
      >
        <header className="h-9 px-3 flex items-center gap-2 border-b border-border/60 shrink-0">
          <div className="flex-1 min-w-0 text-[12px] font-semibold truncate">
            {title ?? <span className="text-muted-foreground font-normal">Инспектор</span>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
            aria-label="Свернуть инспектор"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </header>
        <div className={cn("flex-1 overflow-y-auto", !children && "flex items-center justify-center")}>
          {children ?? (
            <div className="text-center text-xs text-muted-foreground px-6">
              {empty ?? "Выберите объект, чтобы увидеть его свойства."}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default InspectorStack;
