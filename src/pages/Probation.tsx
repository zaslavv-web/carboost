/**
 * Probation period — Iteration 2.
 *
 * Табы:
 *  - mine: испытательный текущего пользователя (просмотр критериев)
 *  - team: для manager — испытательные подчинённых, отметка критериев, decision
 *  - all (HR): все по компании + создание
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Check, X } from "lucide-react";

import { probationApi, type ProbationPeriod } from "@/integrations/laravel/performance";
import { usePrimaryRole } from "@/hooks/useUserProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary", passed: "default", extended: "outline", failed: "destructive",
};

const Probation = () => {
  const { t } = useTranslation("performance");
  const role = usePrimaryRole();
  const qc = useQueryClient();
  const isHr = role === "hrd" || role === "company_admin" || role === "superadmin";
  const isManager = isHr || role === "manager";
  const [tab, setTab] = useState<"mine" | "team" | "all">("mine");

  const { data: mine = [], isLoading: l1 } = useQuery({
    queryKey: ["prob", "mine"], queryFn: () => probationApi.list("mine"),
  });
  const { data: team = [], isLoading: l2 } = useQuery({
    queryKey: ["prob", "team"], queryFn: () => probationApi.list("team"), enabled: isManager,
  });
  const { data: all = [], isLoading: l3 } = useQuery({
    queryKey: ["prob", "all"], queryFn: () => probationApi.list("all"), enabled: isHr,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["prob"] });

  const renderItem = (p: ProbationPeriod, canManage: boolean) => {
    const total = (p.criteria || []).reduce((s, c) => s + Number(c.weight || 1), 0);
    const met = (p.criteria || []).filter((c) => c.is_met).reduce((s, c) => s + Number(c.weight || 1), 0);
    const pct = total > 0 ? Math.round((met / total) * 100) : 0;

    return (
      <div key={p.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-sm">user: <span className="font-mono text-xs">{p.user_id.slice(0, 8)}…</span></p>
            <p className="text-xs text-muted-foreground">
              {new Date(p.start_date).toLocaleDateString()} — {new Date(p.end_date).toLocaleDateString()}
              {p.extended_to && <> · продлён до {new Date(p.extended_to).toLocaleDateString()}</>}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[p.status]}>{t(`probation.status.${p.status}`)}</Badge>
        </div>
        {p.goals && <p className="text-sm">{p.goals}</p>}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{t("probation.criteria.completed")}: {met.toFixed(1)} / {total.toFixed(1)}</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <div className="space-y-1.5">
          {(p.criteria || []).map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <button
                disabled={!canManage}
                onClick={async () => {
                  const { error } = await probationApi.toggleCriterion(p.id, c.id);
                  if (error) toast.error(error.message); else refresh();
                }}
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                  c.is_met ? "bg-primary border-primary text-primary-foreground" : "border-border"
                } ${canManage ? "hover:border-primary" : "opacity-60"}`}
              >
                {c.is_met && <Check className="w-3 h-3" />}
              </button>
              <div className="flex-1">
                <p className={c.is_met ? "line-through text-muted-foreground" : ""}>{c.title}</p>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              </div>
            </div>
          ))}
        </div>
        {canManage && p.status === "active" && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <AddCriterionDialog probationId={p.id} onChange={refresh} />
            <DecisionDialog probation={p} onChange={refresh} />
          </div>
        )}
        {p.decision_notes && (
          <p className="text-xs text-muted-foreground italic">"{p.decision_notes}"</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("probation.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("probation.subtitle")}</p>
        </div>
        {isManager && <CreateProbationDialog onChange={refresh} />}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="mine">{t("probation.tabs.mine")}</TabsTrigger>
          {isManager && <TabsTrigger value="team">{t("probation.tabs.team")}</TabsTrigger>}
          {isHr && <TabsTrigger value="all">{t("probation.tabs.all")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {l1 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
           mine.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("probation.empty.list")}</p> :
           mine.map((p) => renderItem(p, false))}
        </TabsContent>
        {isManager && (
          <TabsContent value="team" className="mt-4 space-y-3">
            {l2 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
             team.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("probation.empty.list")}</p> :
             team.map((p) => renderItem(p, true))}
          </TabsContent>
        )}
        {isHr && (
          <TabsContent value="all" className="mt-4 space-y-3">
            {l3 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
             all.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("probation.empty.list")}</p> :
             all.map((p) => renderItem(p, true))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

const CreateProbationDialog = ({ onChange }: { onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [goals, setGoals] = useState("");
  const [criteria, setCriteria] = useState<{ title: string; description?: string }[]>([{ title: "" }]);

  const submit = async () => {
    if (!userId || !start || !end) { toast.error("Заполните обязательные поля"); return; }
    const cleaned = criteria.filter((c) => c.title.trim());
    const { error } = await probationApi.create({
      user_id: userId, start_date: start, end_date: end, goals: goals || undefined,
      criteria: cleaned,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false); setUserId(""); setStart(""); setEnd(""); setGoals(""); setCriteria([{title:""}]);
    onChange();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5" />{t("probation.actions.create")}</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("probation.actions.create")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
          <div><Label>{t("probation.fields.employee")}</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("probation.fields.startDate")}</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>{t("probation.fields.endDate")}</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label>{t("probation.fields.goals")}</Label><Textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Критерии</Label>
            {criteria.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder={t("probation.fields.criteriaTitle")} value={c.title}
                  onChange={(e) => { const n = [...criteria]; n[i].title = e.target.value; setCriteria(n); }} />
                <Button variant="ghost" size="icon" onClick={() => setCriteria(criteria.filter((_, x) => x !== i))}><X className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCriteria([...criteria, { title: "" }])}>
              <Plus className="w-4 h-4 mr-1" />{t("probation.actions.addCriterion")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("probation.actions.cancel")}</Button>
          <Button onClick={submit}>{t("probation.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddCriterionDialog = ({ probationId, onChange }: { probationId: string; onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const submit = async () => {
    if (!title.trim()) return;
    const { error } = await probationApi.addCriterion(probationId, { title, description: desc || undefined });
    if (error) { toast.error(error.message); return; }
    setOpen(false); setTitle(""); setDesc(""); onChange();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" />{t("probation.actions.addCriterion")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("probation.actions.addCriterion")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>{t("probation.fields.criteriaTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>{t("probation.fields.criteriaDescription")}</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("probation.actions.cancel")}</Button>
          <Button onClick={submit}>{t("probation.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DecisionDialog = ({ probation, onChange }: { probation: ProbationPeriod; onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"passed" | "extended" | "failed">("passed");
  const [extendedTo, setExtendedTo] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    const { error } = await probationApi.decide(probation.id, {
      decision,
      extended_to: decision === "extended" ? extendedTo : undefined,
      decision_notes: notes || undefined,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false); onChange();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">{t("probation.actions.decide")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("probation.actions.decide")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Решение</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passed">{t("probation.actions.decisionPassed")}</SelectItem>
                <SelectItem value="extended">{t("probation.actions.decisionExtended")}</SelectItem>
                <SelectItem value="failed">{t("probation.actions.decisionFailed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {decision === "extended" && (
            <div><Label>{t("probation.fields.extendedTo")}</Label><Input type="date" value={extendedTo} onChange={(e) => setExtendedTo(e.target.value)} /></div>
          )}
          <div><Label>{t("probation.fields.decisionNotes")}</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("probation.actions.cancel")}</Button>
          <Button onClick={submit}>{t("probation.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Probation;
