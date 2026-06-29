import { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}

/** Collapsible section inside the right Inspector — Photoshop palette feel. */
const InspectorSection = ({ title, defaultOpen = true, actions, children, dense }: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border/60 last:border-b-0">
      <header className="flex items-center gap-1 px-3 h-8 select-none">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 flex-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("w-3 h-3 transition-transform", open ? "" : "-rotate-90")} />
          {title}
        </button>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
      {open && <div className={cn(dense ? "px-3 pb-2" : "px-3 pb-3")}>{children}</div>}
    </section>
  );
};

export default InspectorSection;
