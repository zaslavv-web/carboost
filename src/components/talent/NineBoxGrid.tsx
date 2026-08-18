import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BOX_LABELS_12, BOX_LABELS_9, PERF_LABELS, POT_LABELS, type GridRow } from "@/integrations/laravel/talentReview";

interface Props {
  rows: GridRow[];
  cols: number;
  readOnly?: boolean;
  onMove: (userId: string, perfLevel: number, potLevel: number) => void;
  onSelect?: (row: GridRow) => void;
}

const initials = (name?: string | null) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Матрица Performance × Potential с перетаскиванием сотрудников между боксами. */
export default function NineBoxGrid({ rows, cols, readOnly, onMove, onSelect }: Props) {
  const [dragUser, setDragUser] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const labels = cols === 4 ? BOX_LABELS_12 : BOX_LABELS_9;

  const cells = useMemo(() => {
    const map = new Map<string, GridRow[]>();
    rows.forEach((r) => {
      const key = `${Math.min(r.perf_level, cols)}-${r.pot_level}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return map;
  }, [rows, cols]);

  const potRows = [3, 2, 1];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="flex">
          <div className="w-10 shrink-0" />
          <div
            className="grid flex-1 gap-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }, (_, i) => (
              <div key={i} className="pb-2 text-center text-xs font-medium text-muted-foreground">
                {PERF_LABELS[i]}
              </div>
            ))}
          </div>
        </div>

        {potRows.map((pot) => (
          <div key={pot} className="flex items-stretch">
            <div className="flex w-10 shrink-0 items-center justify-center">
              <span className="whitespace-nowrap text-[10px] font-medium text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                {POT_LABELS[pot - 1]}
              </span>
            </div>
            <div
              className="mb-2 grid flex-1 gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: cols }, (_, i) => {
                const perf = i + 1;
                const key = `${perf}-${pot}`;
                const box = (pot - 1) * cols + perf;
                const members = cells.get(key) ?? [];
                const isTop = pot === 3 && perf >= cols - 1;
                return (
                  <Card
                    key={key}
                    onDragOver={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      setHoverCell(key);
                    }}
                    onDragLeave={() => setHoverCell((c) => (c === key ? null : c))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setHoverCell(null);
                      if (readOnly || !dragUser) return;
                      onMove(dragUser, perf, pot);
                      setDragUser(null);
                    }}
                    className={cn(
                      "min-h-[120px] p-2 transition-colors",
                      isTop && "border-primary/40 bg-primary/5",
                      hoverCell === key && "ring-2 ring-primary",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                        {labels[box]}
                      </span>
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        {members.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {members.map((m) => (
                        <button
                          key={m.user_id}
                          type="button"
                          draggable={!readOnly}
                          onDragStart={() => setDragUser(m.user_id)}
                          onClick={() => onSelect?.(m)}
                          title={`${m.full_name ?? ""} — ${m.position ?? ""}`}
                          className={cn(
                            "flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent",
                            m.agreed ? "border-primary/60" : "border-border",
                            m.flight_risk === "high" && "bg-destructive/10",
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold">
                            {initials(m.full_name)}
                          </span>
                          <span className="truncate">{m.full_name ?? "Без имени"}</span>
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex">
          <div className="w-10 shrink-0" />
          <p className="flex-1 pt-1 text-center text-xs text-muted-foreground">
            Результативность (Performance) →
          </p>
        </div>
      </div>
    </div>
  );
}
