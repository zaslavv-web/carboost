import { ReactNode } from "react";

interface Props {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

/** Photoshop-style status bar (28px) pinned to the bottom of the workspace. */
const StatusBar = ({ left, center, right }: Props) => (
  <footer className="h-7 shrink-0 border-t border-border/60 bg-card/80 backdrop-blur-sm flex items-center text-[11px] text-muted-foreground px-3 gap-4">
    <div className="flex items-center gap-3 min-w-0 truncate">{left}</div>
    <div className="flex-1 flex justify-center items-center gap-3 min-w-0 truncate">{center}</div>
    <div className="flex items-center gap-3 min-w-0 truncate">{right}</div>
  </footer>
);

export default StatusBar;
