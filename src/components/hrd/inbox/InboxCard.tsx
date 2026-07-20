import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, AlertTriangle, ShieldAlert, Check, X, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { InboxItem } from "@/hooks/useHrdInbox";
import { leavesApi } from "@/integrations/laravel/leaves";

const KIND_META: Record<InboxItem["kind"], { icon: typeof Calendar; label: string; tone: string }> = {
  leave:             { icon: Calendar,     label: "Отпуск",         tone: "text-sky-600" },
  probation_overdue: { icon: Clock,        label: "Испыт. срок",    tone: "text-destructive" },
  risk:              { icon: ShieldAlert,  label: "Риск",           tone: "text-amber-600" },
};

const SEVERITY_STYLE: Record<InboxItem["severity"], string> = {
  high:   "border-l-destructive",
  medium: "border-l-primary",
  low:    "border-l-border",
};

interface Props { item: InboxItem }

const InboxCard = ({ item }: Props) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hrd-inbox"] });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (item.kind !== "leave") return;
      const raw = item.raw as { id: string };
      await leavesApi.approve(raw.id);
    },
    onSuccess: () => { toast.success("Одобрено"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось одобрить"),
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      if (item.kind !== "leave") return;
      const raw = item.raw as { id: string };
      await leavesApi.reject(raw.id, "Отклонено из инбокса");
    },
    onSuccess: () => { toast.success("Отклонено"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось отклонить"),
  });

  const openDeepLink = () => {
    if (item.kind === "leave") navigate("/leaves");
    else if (item.kind === "probation_overdue") navigate("/probation");
    else if (item.kind === "risk") navigate("/risk-analytics");
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-border/60 border-l-4 bg-card px-4 py-3 hover:border-border transition-colors",
        SEVERITY_STYLE[item.severity],
      )}
    >
      <div className={cn("mt-0.5 rounded-md bg-secondary/60 p-1.5", meta.tone)}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium truncate">{item.title}</span>
          <Badge variant="outline" className="text-[10px] font-normal">{meta.label}</Badge>
          {item.severity === "high" && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-destructive font-medium">
              <AlertTriangle className="w-3 h-3" /> высокий
            </span>
          )}
        </div>
        {item.subtitle && (
          <div className="text-[12px] text-muted-foreground mt-0.5 truncate">{item.subtitle}</div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.kind === "leave" ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-emerald-600 hover:bg-emerald-500/10"
              disabled={busy !== null || approveMut.isPending}
              onClick={() => { setBusy("approve"); approveMut.mutate(); }}
            >
              <Check className="w-4 h-4 mr-1" /> Одобрить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:bg-destructive/10"
              disabled={busy !== null || rejectMut.isPending}
              onClick={() => { setBusy("reject"); rejectMut.mutate(); }}
            >
              <X className="w-4 h-4 mr-1" /> Отклонить
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-8" onClick={openDeepLink}>
            <ExternalLink className="w-4 h-4 mr-1" /> Открыть
          </Button>
        )}
      </div>
    </div>
  );
};

export default InboxCard;
