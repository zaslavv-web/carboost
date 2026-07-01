/**
 * Страница «Отсутствия» — Iteration 1 модуля HR.
 *
 * Табы:
 *  - mine: список своих заявок + кнопка «Запросить»
 *  - inbox: входящие на согласование (менеджер видит pending_manager своих
 *    подчинённых, HRD/admin — pending_hr своей компании)
 *  - balances: остатки по типам отсутствий
 *  - types (HR): управление справочником
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Check, X, Calendar as CalIcon } from "lucide-react";

import { leavesApi, type LeaveRequest, type LeaveStatus, type LeaveType } from "@/integrations/laravel/leaves";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_VARIANT: Record<LeaveStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending_manager: "secondary",
  pending_hr: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
};

const Leaves = () => {
  const { t } = useTranslation("leaves");
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const isHr = role === "hrd" || role === "company_admin" || role === "superadmin";
  const isManagerOrHr = isHr || role === "manager";

  const [tab, setTab] = useState<"mine" | "inbox" | "balances" | "calendar" | "types">("mine");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ["leaves", "types"],
    queryFn: () => leavesApi.listTypes(true),
  });
  const { data: balances = [] } = useQuery({
    queryKey: ["leaves", "balances", profile?.user_id],
    queryFn: () => leavesApi.listBalances(),
    enabled: !!profile,
  });
  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ["leaves", "requests", "mine"],
    queryFn: () => leavesApi.listRequests("mine"),
  });
  const { data: inbox = [], isLoading: loadingInbox } = useQuery({
    queryKey: ["leaves", "requests", "inbox"],
    queryFn: () => leavesApi.listRequests("inbox"),
    enabled: isManagerOrHr,
  });

  const approve = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      leavesApi.approve(id, comment),
    onSuccess: () => {
      toast.success(t("messages.approved"));
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });
  const reject = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      leavesApi.reject(id, comment),
    onSuccess: () => {
      toast.success(t("messages.rejected"));
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: (e: any) => toast.error(e?.message || "Error"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => leavesApi.cancel(id),
    onSuccess: () => {
      toast.success(t("messages.cancelled"));
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
  });

  const handleReject = (id: string) => {
    const reason = window.prompt(t("fields.rejectionReason") + ":");
    if (reason && reason.trim().length > 0) reject.mutate({ id, comment: reason.trim() });
  };

  const renderRequestRow = (r: LeaveRequest, mode: "mine" | "inbox") => {
    const typeTitle = r.leaveType?.title || types.find((tp) => tp.id === r.leave_type_id)?.title || "—";
    return (
      <div key={r.id} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{typeTitle}</h4>
            <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <CalIcon className="w-3.5 h-3.5" />
            {new Date(r.start_date).toLocaleDateString()} – {new Date(r.end_date).toLocaleDateString()}
            <span className="text-foreground">· {r.days_count} {t("fields.days").toLowerCase()}</span>
          </p>
          {r.reason && <p className="text-sm mt-1.5">{r.reason}</p>}
          {(r.manager_comment || r.hr_comment) && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {r.manager_comment && <>👤 {r.manager_comment}</>}
              {r.manager_comment && r.hr_comment && " · "}
              {r.hr_comment && <>🏢 {r.hr_comment}</>}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {mode === "inbox" && (r.status === "pending_manager" || r.status === "pending_hr") && (
            <>
              <Button size="sm" onClick={() => approve.mutate({ id: r.id })} disabled={approve.isPending}>
                <Check className="w-4 h-4 mr-1" /> {t("actions.approve")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleReject(r.id)}>
                <X className="w-4 h-4 mr-1" /> {t("actions.reject")}
              </Button>
            </>
          )}
          {mode === "mine" && (r.status === "pending_manager" || r.status === "pending_hr") && (
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>
              {t("actions.cancel")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" /> {t("actions.request")}</Button>
          </DialogTrigger>
          <RequestDialogContent
            types={types}
            onClose={() => setDialogOpen(false)}
            onCreated={() => {
              setDialogOpen(false);
              qc.invalidateQueries({ queryKey: ["leaves"] });
            }}
          />
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
          {isManagerOrHr && <TabsTrigger value="inbox">{t("tabs.inbox")}</TabsTrigger>}
          <TabsTrigger value="balances">{t("tabs.balances")}</TabsTrigger>
          {isHr && <TabsTrigger value="types">{t("tabs.types")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4 space-y-2">
          {loadingMine ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-12" />
          ) : mine.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("empty.mine")}</p>
          ) : (
            mine.map((r) => renderRequestRow(r, "mine"))
          )}
        </TabsContent>

        {isManagerOrHr && (
          <TabsContent value="inbox" className="mt-4 space-y-2">
            {loadingInbox ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-12" />
            ) : inbox.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("empty.inbox")}</p>
            ) : (
              inbox.map((r) => renderRequestRow(r, "inbox"))
            )}
          </TabsContent>
        )}

        <TabsContent value="balances" className="mt-4">
          {balances.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("empty.balances")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((b) => {
                const ttl = b.leaveType?.title || types.find((tp) => tp.id === b.leave_type_id)?.title || "—";
                const avail = Number(b.accrued_days) + Number(b.carryover_days) - Number(b.used_days);
                return (
                  <div key={b.id} className="bg-card border border-border rounded-lg p-4">
                    <p className="font-semibold">{ttl}</p>
                    <p className="text-3xl font-bold text-primary mt-2">{avail.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">{t("balance.available")}</p>
                    <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                      <div>{t("balance.accrued")}: {Number(b.accrued_days).toFixed(1)}</div>
                      <div>{t("balance.used")}: {Number(b.used_days).toFixed(1)}</div>
                      {Number(b.carryover_days) > 0 && <div>{t("balance.carryover")}: {Number(b.carryover_days).toFixed(1)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {isHr && (
          <TabsContent value="types" className="mt-4">
            <TypesManager types={types} onChange={() => qc.invalidateQueries({ queryKey: ["leaves", "types"] })} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

// ----- Request dialog -----

const RequestDialogContent = ({
  types, onClose, onCreated,
}: { types: LeaveType[]; onClose: () => void; onCreated: () => void }) => {
  const { t } = useTranslation("leaves");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [substitute, setSubstitute] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedType = types.find((tp) => tp.id === leaveTypeId);

  const submit = async () => {
    if (!leaveTypeId || !start || !end) {
      toast.error("Заполните все поля");
      return;
    }
    setSubmitting(true);
    const { error } = await leavesApi.createRequest({
      leave_type_id: leaveTypeId,
      start_date: start,
      end_date: end,
      reason: reason || undefined,
      substitute_user_id: substitute || undefined,
      files: fileUrl ? [{ file_url: fileUrl, file_name: fileUrl.split("/").pop() }] : undefined,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("messages.requestCreated"));
    onCreated();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{t("actions.request")}</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <Label>{t("fields.type")}</Label>
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger><SelectValue placeholder={t("fields.type")} /></SelectTrigger>
            <SelectContent>
              {types.map((tp) => <SelectItem key={tp.id} value={tp.id}>{tp.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("fields.startDate")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>{t("fields.endDate")}</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>{t("fields.reason")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>{t("fields.substitute")} <span className="text-xs text-muted-foreground">(user_id)</span></Label>
          <Input value={substitute} onChange={(e) => setSubstitute(e.target.value)} placeholder="uuid" />
          <p className="text-xs text-muted-foreground mt-1">{t("fields.substituteHint")}</p>
        </div>
        {selectedType?.requires_medical_cert && (
          <div>
            <Label>{t("fields.medicalCert")} (URL)</Label>
            <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("actions.close")}</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {t("actions.save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

// ----- HR types manager -----

const TypesManager = ({ types, onChange }: { types: LeaveType[]; onChange: () => void }) => {
  const { t } = useTranslation("leaves");
  const [code, setCode] = useState("annual");
  const [title, setTitle] = useState("");
  const [accrual, setAccrual] = useState("0");
  const [requiresCert, setRequiresCert] = useState(false);

  const create = async () => {
    if (!code || !title) { toast.error("Заполните код и название"); return; }
    const { error } = await leavesApi.createType({
      code, title,
      paid: !code.endsWith("unpaid"),
      accrual_days_per_year: Number(accrual) || 0,
      requires_medical_cert: requiresCert,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("OK"); setTitle(""); onChange();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Удалить?")) return;
    const { error } = await leavesApi.deleteType(id);
    if (error) { toast.error(error.message); return; }
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-5 items-end">
        <div>
          <Label>Код</Label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["annual","sick_paid","sick_unpaid","maternity","study","day_off","unpaid"].map((c) =>
                <SelectItem key={c} value={c}>{t(`types.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Название</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Дней/год</Label>
          <Input type="number" value={accrual} onChange={(e) => setAccrual(e.target.value)} />
        </div>
        <Button onClick={create}>{t("actions.save")}</Button>
      </div>

      {types.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">{t("empty.types")}</p>
      ) : (
        <div className="space-y-2">
          {types.map((tp) => (
            <div key={tp.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{tp.title}</p>
                <p className="text-xs text-muted-foreground">
                  {tp.code} · {tp.paid ? "paid" : "unpaid"} · {tp.accrual_days_per_year} {t("fields.days").toLowerCase()}/год
                  {tp.requires_medical_cert && " · справка"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(tp.id)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Leaves;
