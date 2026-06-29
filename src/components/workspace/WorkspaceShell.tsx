import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  rail?: ReactNode;
  inspector?: ReactNode;
  statusBar?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * App-shell for Figma/Photoshop-style modules:
 *   [rail? | toolbar over canvas | inspector] + status bar
 * `rail` is optional — omit it to use a top toolbar instead of a side rail.
 */
const WorkspaceShell = ({ rail, inspector, statusBar, toolbar, children, className }: Props) => (
  <div
    className={cn(
      "flex flex-col -m-3 md:-m-8 h-[calc(100vh-3rem)] bg-background overflow-hidden",
      className,
    )}
  >
    <div className="flex flex-1 min-h-0">
      {rail}
      <div className="flex-1 flex flex-col min-w-0">
        {toolbar}
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
      {inspector}
    </div>
    {statusBar}
  </div>
);

export default WorkspaceShell;

