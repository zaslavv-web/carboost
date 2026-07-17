import { laravelDb } from "@/integrations/laravel/db";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Upload, Plus, Trash2, Mail, Users, FileSpreadsheet, Loader2, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { useTranslation } from "react-i18next";

interface InviteResult {
  row?: number;
  email?: string | null;
  status: "created" | "resent" | "pending_exists" | "claimed" | "invalid_email" | "mail_failed" | "error";
  error?: string;
  invitation_id?: string;
}

interface InviteRow {
  email: string;
  full_name?: string;
  position_id?: string;
  department?: string;
  requested_role?: string;
}

const Invitations = () => {
  const queryClient = useQueryClient();
  const { data: profile } = useUserProfile();
  const { t } = useTranslation("admin");
  const companyId = profile?.company_id;

  const [draft, setDraft] = useState<InviteRow[]>([{ email: "" }]);
  const [parsing, setParsing] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ emails: string[] } | null>(null);

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_for_invite", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await laravelDb
        .from("positions")
        .select("id, title, department")
        .eq("company_id", companyId)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["invitations", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await laravelDb
        .from("employee_invitations" as any)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!companyId,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { invites: InviteRow[]; force?: boolean }) => {
      const cleaned = payload.invites
        .map((i) => ({ ...i, email: i.email.trim().toLowerCase() }))
        .filter((i) => i.email.length > 0);
      if (cleaned.length === 0) throw new Error(t("invitations.errorNoValidEmail"));
      const { data, error } = await laravelRpc("bulk_invite_employees" as any, {
        _invites: cleaned,
        _force_resend: !!payload.force,
      });
      if (error) throw error;
      return { data: data as any, force: !!payload.force };
    },
    onSuccess: ({ data: res, force }) => {
      const results: InviteResult[] = Array.isArray(res?.results) ? res.results : [];

      // Диагностика по каждому email — как просил пользователь
      const invalids = results.filter((r) => r.status === "invalid_email");
      const claimed = results.filter((r) => r.status === "claimed");
      const pendingExists = results.filter((r) => r.status === "pending_exists");
      const created = results.filter((r) => r.status === "created");
      const resent = results.filter((r) => r.status === "resent");
      const mailFailed = results.filter((r) => r.status === "mail_failed");
      const otherErrors = results.filter((r) => r.status === "error");

      // 4) e-mail введен некорректно
      invalids.forEach((r) => {
        toast.error(
          `${r.email || "—"}: Вы ошиблись при написании электронной почты, проверьте правильность написания и повторите попытку`
        );
      });

      // 3) пользователь уже авторизован
      claimed.forEach((r) => {
        toast.error(`Пользователь с e-mail ${r.email} уже авторизован в системе`);
      });

      // 1) успешное создание
      created.forEach((r) => {
        toast.success(`Приглашение отправлено: ${r.email}`);
      });

      // Успешная повторная отправка (после подтверждения)
      resent.forEach((r) => {
        toast.success(`Приглашение отправлено повторно: ${r.email}`);
      });

      // Письмо не ушло, но запись создана
      mailFailed.forEach((r) => {
        toast.warning(
          `${r.email}: запись сохранена, но письмо не ушло${r.error ? ` (${r.error})` : ""}. Нажмите «Отправить повторно» в списке ниже.`,
          { duration: 8000 }
        );
      });

      // Прочие ошибки
      otherErrors.forEach((r) => {
        toast.error(`${r.email || "строка " + r.row}: ${r.error || "ошибка"}`);
      });

      // 2) уже есть pending — показываем confirm-диалог (только если это не повторный вызов)
      if (!force && pendingExists.length > 0) {
        setPendingConfirm({ emails: pendingExists.map((r) => r.email!).filter(Boolean) });
      } else {
        // Очищаем черновик только если это финальный ответ и нет открытого диалога
        if (created.length + resent.length + mailFailed.length > 0) {
          setDraft([{ email: "" }]);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["invitations", companyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const confirmResend = () => {
    if (!pendingConfirm) return;
    const invites = draft.filter((d) =>
      pendingConfirm.emails.includes(d.email.trim().toLowerCase())
    );
    setPendingConfirm(null);
    if (invites.length > 0) {
      sendMutation.mutate({ invites, force: true });
    }
  };

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await laravelRpc("resend_invitation" as any, { _invitation_id: id });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      if (res?.mailed) toast.success("Письмо отправлено повторно");
      else toast.error(`Не удалось отправить: ${res?.error || "неизвестная ошибка"}`);
      queryClient.invalidateQueries({ queryKey: ["invitations", companyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb
        .from("employee_invitations" as any)
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations", companyId] }),
  });

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      const parsed: InviteRow[] = rows
        .map((r) => ({
          email: String(r.email || r.Email || r["E-mail"] || "").trim().toLowerCase(),
          full_name: String(r.full_name || r["ФИО"] || r.name || "").trim(),
          department: String(r.department || r["Отдел"] || "").trim(),
          requested_role: String(r.role || r["Роль"] || "employee").trim(),
        }))
        .filter((r) => r.email.includes("@"));
      if (parsed.length === 0) {
        toast.error(t("invitations.errorNoValidEmail"));
        return;
      }
      setDraft(parsed);
      toast.success(t("invitations.toastLoadedRows", { count: parsed.length }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setParsing(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "claimed") return "bg-success/10 text-success";
    if (s === "cancelled") return "bg-destructive/10 text-destructive";
    return "bg-warning/10 text-warning";
  };
  const statusLabel = (s: string) =>
    s === "claimed" ? t("invitations.statusClaimed") : s === "cancelled" ? t("invitations.statusCancelled") : t("invitations.statusPending");

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("invitations.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("invitations.subtitle")}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-foreground">{t("invitations.newInvitations")}</h3>
          <div className="flex gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {t("invitations.uploadXlsxBtn")}
              </span>
            </label>
            <Button size="sm" variant="outline" onClick={() => setDraft([...draft, { email: "" }])}>
              <Plus className="w-4 h-4 mr-1" /> {t("invitations.addRowBtn")}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">{t("invitations.colEmail")}</th>
                <th className="py-2 pr-2">{t("invitations.colFullName")}</th>
                <th className="py-2 pr-2">{t("invitations.colPosition")}</th>
                <th className="py-2 pr-2">{t("invitations.colDept")}</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 pr-2">
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => {
                        const next = [...draft];
                        next[i] = { ...next[i], email: e.target.value };
                        setDraft(next);
                      }}
                      placeholder="user@company.com"
                      className="w-full px-2 py-1.5 rounded border border-border bg-background"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={row.full_name || ""}
                      onChange={(e) => {
                        const next = [...draft];
                        next[i] = { ...next[i], full_name: e.target.value };
                        setDraft(next);
                      }}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={row.position_id || ""}
                      onChange={(e) => {
                        const next = [...draft];
                        next[i] = { ...next[i], position_id: e.target.value || undefined };
                        setDraft(next);
                      }}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background"
                    >
                      <option value="">—</option>
                      {positions.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={row.department || ""}
                      onChange={(e) => {
                        const next = [...draft];
                        next[i] = { ...next[i], department: e.target.value };
                        setDraft(next);
                      }}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background"
                    />
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                      className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button
          onClick={() => sendMutation.mutate(draft)}
          disabled={sendMutation.isPending}
          className="w-full sm:w-auto"
        >
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {t("invitations.sendBtn")}
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{t("invitations.listTitle", { count: invitations.length })}</h3>
        </div>

        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t("invitations.noInvitations")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">{t("invitations.colFullName")}</th>
                  <th className="py-2 pr-2">{t("invitations.colDept")}</th>
                  <th className="py-2 pr-2">{t("invitations.colStatus")}</th>
                  <th className="py-2 pr-2">{t("invitations.colCreated")}</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="py-2 pr-2 text-foreground">{inv.email}</td>
                    <td className="py-2 pr-2">{inv.full_name || "—"}</td>
                    <td className="py-2 pr-2">{inv.department || "—"}</td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(inv.status)}`}>
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: getDateLocale() })}
                    </td>
                    <td className="py-2">
                      {inv.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => resendMutation.mutate(inv.id)}
                            disabled={resendMutation.isPending}
                            className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-50"
                            title="Отправить повторно"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancelMutation.mutate(inv.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            title={t("invitations.cancelTitle")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invitations;
