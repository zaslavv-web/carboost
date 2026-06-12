/**
 * Disciplinary records — Iteration 2.
 *
 * Реестр предупреждений / PIP / Observation + 1:1 встречи.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Check, X, Calendar } from "lucide-react";

import {
  disciplinaryApi,
  oneOnOneApi,
  type DisciplinaryRecord,
} from "@/integrations/laravel/performance";
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

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  warning: "secondary", pip: "destructive", observation: "outline",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary", closed: "default", escalated: "destructive",
};

const Disciplinary = () => {
  const { t } = useTranslation("performance");
  const role = usePrimaryRole();
  const qc = useQueryClient();
  const isHr = role === "hrd" || role === "company_admin" || role === "superadmin";
  const isManager = isHr || role === "manager";
  const [tab, setTab] = useState<"mine" | "team" | "all">("mine");

  const { data: mine = [], isLoading: l1 } = useQuery({ queryKey: ["disc", "mine"], queryFn: () => disciplinaryApi.list("mine") });
  const { data: team = [], isLoading: l2 } = useQuery({ queryKey: ["disc", "team"], queryFn: () => disciplinaryApi.list("team"), enabled: isManager });
  const { data: all = [], isLoading: l3 } = useQuery({ queryKey: ["disc", "all"], queryFn: () => disciplinaryApi.list("all"), enabled: isHr });

  const refresh = () => qc.invalidateQueries({ queryKey: ["disc"] });

  const renderItem = (r: DisciplinaryRecord, canManage: boolean) => {
    const total = (r.criteria || []).length;
    const met = (r.criteria || []).filter((c) => c.is_met).length;
    const pct = total > 0 ? Math.round((met / total) * 100) : 0;
    return (
      <div key={r.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={TYPE_VARIANT[r.type]}>{t(`disciplinary.types.${r.type}`)}</Badge>
            <Badge variant={STATUS_VARIANT[r.status]}>{t(`disciplinary.status.${r.status}`)}</Badge>
            <span className="text-xs text-muted-foreground">
              {t(`disciplinary.severity.${r.severity}`)} ·
              {r.issued_at && " " + new Date(r.issued_at).toLocaleDateString()}
              {r.valid_until && <> · до {new Date(r.valid_until).toLocaleDateString()}</>}
            </span>
          </div>
        </div>
        <p className="text-sm">{r.reason}</p>
        {total > 0 && (
          <>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{t("probation.criteria.completed")}: {met}/{total}</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} />
            </div>
            <div className="space-y-1.5">
              {(r.criteria || []).map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-sm">
                  <button
                    disabled={!canManage || r.status !== "active"}
                    onClick={async () => {
                      const { error } = await disciplinaryApi.toggleCriterion(r.id, c.id);
                      if (error) toast.error(error.message); else refresh();
                    }}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      c.is_met ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    } ${canManage && r.status === "active" ? "hover:border-primary" : "opacity-60"}`}
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
          </>
        )}
        {canManage && r.status === "active" && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <AddCriterionDialog recordId={r.id} onChange={refresh} />
            <ScheduleMeetingDialog employeeId={r.user_id} recordId={r.id} />
            <CloseDialog record={r} onChange={refresh} />
          </div>
        )}
        {r.closure_reason && (
          <p className="text-xs text-muted-foreground italic">Закрыта: "{r.closure_reason}"</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("disciplinary.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("disciplinary.subtitle")}</p>
        </div>
        {isManager && <CreateRecordDialog onChange={refresh} />}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="mine">{t("disciplinary.tabs.mine")}</TabsTrigger>
          {isManager && <TabsTrigger value="team">{t("disciplinary.tabs.team")}</TabsTrigger>}
          {isHr && <TabsTrigger value="all">{t("disciplinary.tabs.all")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-3">
          {l1 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
           mine.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("disciplinary.empty.list")}</p> :
           mine.map((r) => renderItem(r, false))}
        </TabsContent>
        {isManager && (
          <TabsContent value="team" className="mt-4 space-y-3">
            {l2 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
             team.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("disciplinary.empty.list")}</p> :
             team.map((r) => renderItem(r, true))}
          </TabsContent>
        )}
        {isHr && (
          <TabsContent value="all" className="mt-4 space-y-3">
            {l3 ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-12 text-primary" /> :
             all.length === 0 ? <p className="text-center text-muted-foreground py-8">{t("disciplinary.empty.list")}</p> :
             all.map((r) => renderItem(r, true))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

const CreateRecordDialog = ({ onChange }: { onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<"warning" | "pip" | "observation">("warning");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [reason, setReason] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [criteria, setCriteria] = useState<{ title: string }[]>([]);

  const submit = async () => {
    if (!userId || !reason) { toast.error("Заполните обязательные поля"); return; }
    const { error } = await disciplinaryApi.create({
      user_id: userId, type, severity, reason, valid_until: validUntil || undefined,
      criteria: criteria.filter((c) => c.title.trim()),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false); onChange();
    setUserId(""); setReason(""); setCriteria([]); setValidUntil("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5" />{t("disciplinary.actions.create")}</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("disciplinary.actions.create")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
          <div><Label>{t("disciplinary.fields.employee")}</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("disciplinary.fields.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">{t("disciplinary.types.warning")}</SelectItem>
                  <SelectItem value="pip">{t("disciplinary.types.pip")}</SelectItem>
                  <SelectItem value="observation">{t("disciplinary.types.observation")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("disciplinary.fields.severity")}</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("disciplinary.severity.low")}</SelectItem>
                  <SelectItem value="medium">{t("disciplinary.severity.medium")}</SelectItem>
                  <SelectItem value="high">{t("disciplinary.severity.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>{t("disciplinary.fields.reason")}</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>{t("disciplinary.fields.validUntil")}</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          {(type === "pip" || type === "observation") && (
            <div className="space-y-2">
              <Label>Критерии выхода</Label>
              {criteria.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder={t("disciplinary.fields.criteriaTitle")} value={c.title}
                    onChange={(e) => { const n = [...criteria]; n[i].title = e.target.value; setCriteria(n); }} />
                  <Button variant="ghost" size="icon" onClick={() => setCriteria(criteria.filter((_, x) => x !== i))}><X className="w-4 h-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setCriteria([...criteria, { title: "" }])}>
                <Plus className="w-4 h-4 mr-1" />{t("disciplinary.actions.addCriterion")}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={submit}>{t("disciplinary.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddCriterionDialog = ({ recordId, onChange }: { recordId: string; onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const submit = async () => {
    if (!title.trim()) return;
    const { error } = await disciplinaryApi.addCriterion(recordId, { title, description: desc || undefined });
    if (error) { toast.error(error.message); return; }
    setOpen(false); setTitle(""); setDesc(""); onChange();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" />{t("disciplinary.actions.addCriterion")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("disciplinary.actions.addCriterion")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>{t("disciplinary.fields.criteriaTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>{t("disciplinary.fields.criteriaDescription")}</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={submit}>{t("disciplinary.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CloseDialog = ({ record, onChange }: { record: DisciplinaryRecord; onChange: () => void }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"closed" | "escalated">("closed");
  const submit = async () => {
    if (!reason.trim()) return;
    const { error } = await disciplinaryApi.close(record.id, { closure_reason: reason, status });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false); onChange();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm">{t("disciplinary.actions.close")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("disciplinary.actions.close")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Статус</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="closed">{t("disciplinary.status.closed")}</SelectItem>
                <SelectItem value="escalated">{t("disciplinary.status.escalated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("disciplinary.fields.closureReason")}</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={submit}>{t("disciplinary.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ScheduleMeetingDialog = ({ employeeId, recordId }: { employeeId: string; recordId: string }) => {
  const { t } = useTranslation("performance");
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [agenda, setAgenda] = useState("");
  const submit = async () => {
    if (!when) { toast.error("Укажите время"); return; }
    const { error } = await oneOnOneApi.create({
      employee_id: employeeId,
      scheduled_at: when,
      duration_min: Number(duration) || 30,
      agenda: agenda || undefined,
      related_type: "disciplinary",
      related_id: recordId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Calendar className="w-4 h-4 mr-1" />{t("disciplinary.meetings.schedule")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("disciplinary.meetings.title")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>{t("disciplinary.meetings.when")}</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><Label>{t("disciplinary.meetings.duration")}</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          <div><Label>{t("disciplinary.meetings.agenda")}</Label><Textarea rows={2} value={agenda} onChange={(e) => setAgenda(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={submit}>{t("disciplinary.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Disciplinary;
