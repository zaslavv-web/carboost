import type { ReactNode } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  order: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  className?: string;
  children: ReactNode;
};

/** Обёртка блока дашборда с кнопками «вверх/вниз». Порядок хранит useBlockOrder. */
export function ReorderableBlock({ id, label, order, isFirst, isLast, onMove, className, children }: Props) {
  return (
    <section className={cn("group relative", className)} style={{ order }} aria-label={label}>
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-sm"
          disabled={isFirst}
          aria-label={`Переместить блок «${label}» вверх`}
          onClick={() => onMove(id, -1)}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-7 w-7 shadow-sm"
          disabled={isLast}
          aria-label={`Переместить блок «${label}» вниз`}
          onClick={() => onMove(id, 1)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </section>
  );
}
