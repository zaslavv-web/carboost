import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

/** Compact 36px action bar pinned above the canvas. */
const CanvasToolbar = ({ left, right, className }: Props) => (
  <div
    className={cn(
      "h-9 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-sm px-3 flex items-center gap-2",
      className,
    )}
  >
    <div className="flex items-center gap-2 flex-1 min-w-0">{left}</div>
    {right && <div className="flex items-center gap-2">{right}</div>}
  </div>
);

export default CanvasToolbar;
