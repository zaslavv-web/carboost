/**
 * Performance Reviews — Iteration 2.
 *
 * Табы:
 *  - mine: мои оценки (заполнение самооценки, просмотр итогов)
 *  - team: для manager — оценки подчинённых, кнопка "submit manager rating" + finalize
 *  - cycles (HR): управление циклами оценки + open/close
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Check } from "lucide-react";

import {
  performanceApi,
  type PerformanceCycle,
  type PerformanceReview,
} from "@/integrations/laravel/performance";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  self_done: "secondary",
  manager_done: "secondary",
  finalized: "default",
  open: "default",
  closed: "outline",
};

const Performance = () => {
  const { t } = useTranslation("performance");
  const role = usePrimaryRole();
  const qc = useQueryClient();
  const isHr = role === "hrd" || role === "company_admin" || role === "superadmin";
  const isManager = isHr || role === "manager";
  const [tab, setTab] = useState<"mine" | "team" | "cycles">("mine");

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ["perf", "reviews", "mine"],
    queryFn: () => performanceApi.listReviews("mine"),
  });
  const { data: team = [], isLoading: loadingTeam } = useQuery({
    queryKey: ["perf", "reviews", "team"],
    queryFn: () => performanceApi.listReviews("team"),
    enabled: isManager,
  });
  const { data: cycles = [] } = useQuery({
    queryKey: ["perf", "cycles"],
    queryFn: () => performanceApi.listCycles(),
    enabled: isHr,
  });

  const renderReview = (r: PerformanceReview, mode: "mine" | "team") => (
    <div key={r.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-semibold">{r.cycle?.title || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {r.cycle?.period_start} — {r.cycle?.period_end}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Score label="self" v={r.self_score} />
        <Score label="manager" v={r.manager_score} />
        <Score label="peer" v={r.peer_score} />
        <Score label="final" v={r.final_score} highlight />
      </div>
      <div className="flex gap-2 flex-wrap">
        {mode === "mine" && r.status !== "finalized" && (
          <FeedbackDialog review={r} role="self" />
        )}
        {mode === "team" && r.status !== "finalized" && (
          <FeedbackDialog review={r} role="manager" />
        )}
        {mode === "team" && r.status === "manager_done" && (
          <FinalizeDialog review={r} />
        )}
      </div>
      {r.summary && <p className="text-sm text-muted-foreground italic">"{r.summary}"</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
          {isManager && <TabsTrigger value="team">{t("tabs.team")}</TabsTrigger>}
          {isHr && <TabsTrigger value="cycles">{t("tabs.cycles")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {loadingMine ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
           mine.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("empty.reviews")}</p> :
           mine.map((r) => renderReview(r, "mine"))}
        </TabsContent>

        {isManager && (
          <TabsContent value="team" className="mt-4 space-y-3">
            {loadingTeam ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
             team.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("empty.reviews")}</p> :
             team.map((r) => renderReview(r, "team"))}
          </TabsContent>
        )}

        {isHr && (
          <TabsContent value="cycles" className="mt-4 space-y-3">
            <CycleManager cycles={cycles} onChange={() => qc.invalidateQueries({ queryKey: ["perf"] })} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

const Score = ({ label, v, highlight }: { label: string; v?: number | null; highlight?: boolean }) => (
  <div className={`rounded-md p-2 ${highlight ? "bg-primary/10 text-primary" : "bg-muted"}`}>
    <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
    <p className="text-lg font-bold">{v != null ? Number(v).toFixed(2) : "—"}</p>
  </div>
);

// --- Feedback dialog ---
const FeedbackDialog = ({ review, role }: { review: PerformanceReview; role: "self" | "manager" }) => {
  const { t } = useTranslation("performance");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [overall, setOverall] = useState("");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");

  const submit = async () => {
    const { error } = await performanceApi.submitFeedback(review.id, {
      role,
      overall_score: Number(overall) || null,
      strengths, improvements, comments,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("messages.feedbackSaved"));
    qc.invalidateQueries({ queryKey: ["perf"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{role === "self" ? t("actions.submitSelf") : t("actions.submitManager")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{role === "self" ? t("actions.submitSelf") : t("actions.submitManager")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>{t("fields.overallScore")}</Label>
            <Input type="number" step="0.1" min="0" max="5" value={overall} onChange={(e) => setOverall(e.target.value)} />
          </div>
          <div><Label>{t("fields.strengths")}</Label><Textarea rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} /></div>
          <div><Label>{t("fields.improvements")}</Label><Textarea rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} /></div>
          <div><Label>{t("fields.comments")}</Label><Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
          <Button onClick={submit}>{t("actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FinalizeDialog = ({ review }: { review: PerformanceReview }) => {
  const { t } = useTranslation("performance");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");

  const submit = async () => {
    const { error } = await performanceApi.finalize(review.id, summary);
    if (error) { toast.error(error.message); return; }
    toast.success(t("messages.finalized"));
    qc.invalidateQueries({ queryKey: ["perf"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary"><Check className="w-4 h-4 mr-1" />{t("actions.finalize")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("actions.finalize")}</DialogTitle></DialogHeader>
        <div className="py-2"><Label>{t("fields.summary")}</Label><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
          <Button onClick={submit}>{t("actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Cycle manager (HR) ---
const CycleManager = ({ cycles, onChange }: { cycles: PerformanceCycle[]; onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [ps, setPs] = useState("");
  const [pe, setPe] = useState("");
  const [deadline, setDeadline] = useState("");
  const [ws, setWs] = useState("0.2"); const [wm, setWm] = useState("0.5"); const [wp, setWp] = useState("0.3");

  const create = async () => {
    if (!title || !ps || !pe) { toast.error("Fill required fields"); return; }
    const { error } = await performanceApi.createCycle({
      title, period_start: ps, period_end: pe, deadline: deadline || undefined,
      weights: { self: +ws, manager: +wm, peer: +wp },
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false); setTitle(""); onChange();
  };

  const openCycle = async (id: string) => {
    const { error } = await performanceApi.openCycle(id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("messages.cycleOpened")); onChange();
  };
  const closeCycle = async (id: string) => {
    const { error } = await performanceApi.closeCycle(id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("messages.cycleClosed")); onChange();
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5" />{t("actions.createCycle")}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("actions.createCycle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("fields.cycleTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("fields.periodStart")}</Label><Input type="date" value={ps} onChange={(e) => setPs(e.target.value)} /></div>
              <div><Label>{t("fields.periodEnd")}</Label><Input type="date" value={pe} onChange={(e) => setPe(e.target.value)} /></div>
            </div>
            <div><Label>{t("fields.deadline")}</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>{t("fields.weightSelf")}</Label><Input type="number" step="0.05" value={ws} onChange={(e) => setWs(e.target.value)} /></div>
              <div><Label>{t("fields.weightManager")}</Label><Input type="number" step="0.05" value={wm} onChange={(e) => setWm(e.target.value)} /></div>
              <div><Label>{t("fields.weightPeer")}</Label><Input type="number" step="0.05" value={wp} onChange={(e) => setWp(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button onClick={create}>{t("actions.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cycles.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">{t("empty.cycles")}</p>
      ) : cycles.map((c) => (
        <div key={c.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold flex items-center gap-2">
              {c.title}
              <Badge variant={STATUS_VARIANT[c.status]}>{t(`status.${c.status}`)}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">{c.period_start} — {c.period_end} · deadline: {c.deadline || "—"}</p>
          </div>
          <div className="flex gap-2">
            {c.status === "draft" && <Button size="sm" onClick={() => openCycle(c.id)}>{t("actions.open")}</Button>}
            {c.status === "open" && <Button size="sm" variant="outline" onClick={() => closeCycle(c.id)}>{t("actions.close")}</Button>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Performance;
