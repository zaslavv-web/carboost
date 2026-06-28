import { ReactNode, useState } from "react";
import { RotateCw, LayoutGrid, Table as TableIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrientation } from "@/hooks/useOrientation";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps<T> {
  /** Data items to render */
  items: T[];
  /** Render function for mobile card view (one card per item) */
  renderCard: (item: T, index: number) => ReactNode;
  /** Table content (thead + tbody) for desktop / landscape view */
  table: ReactNode;
  /** Default view on mobile portrait. Defaults to "cards". */
  mobileDefault?: "cards" | "table";
  /** Extra className on the outer wrapper */
  className?: string;
  /** Optional className on the cards list container */
  cardsClassName?: string;
  /** Empty state node (used when items.length === 0) */
  empty?: ReactNode;
  /** Min width for the table (px). Default 800. */
  tableMinWidth?: number;
}

/**
 * Hybrid responsive table:
 * - Desktop / tablet: renders the provided <table>.
 * - Mobile portrait: renders a list of cards by default, with a toggle to switch
 *   to the table view (with a "поверните телефон" hint when still in portrait).
 * - Mobile landscape: renders the table directly (horizontal scroll if needed).
 */
export function ResponsiveTable<T>({
  items,
  renderCard,
  table,
  mobileDefault = "cards",
  className,
  cardsClassName,
  empty,
  tableMinWidth = 800,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  const [mode, setMode] = useState<"cards" | "table">(mobileDefault);

  if (items.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  // Desktop / tablet — always table.
  if (!isMobile) {
    return (
      <div className={cn("bg-card rounded-xl border border-border overflow-x-auto", className)}>
        <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
          {table}
        </table>
      </div>
    );
  }

  // Mobile landscape — table view with horizontal scroll if needed.
  if (orientation === "landscape") {
    return (
      <div className={cn("bg-card rounded-xl border border-border overflow-x-auto", className)}>
        <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
          {table}
        </table>
      </div>
    );
  }

  // Mobile portrait.
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <RotateCw className="w-3.5 h-3.5" />
          Поверните телефон для табличного вида
        </p>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setMode("cards")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              mode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            aria-pressed={mode === "cards"}
            aria-label="Карточки"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Карточки
          </button>
          <button
            type="button"
            onClick={() => setMode("table")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              mode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            aria-pressed={mode === "table"}
            aria-label="Таблица"
          >
            <TableIcon className="w-3.5 h-3.5" />
            Таблица
          </button>
        </div>
      </div>

      {mode === "cards" ? (
        <div className={cn("space-y-2", cardsClassName)}>
          {items.map((item, i) => (
            <div key={i}>{renderCard(item, i)}</div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
            {table}
          </table>
        </div>
      )}
    </div>
  );
}
