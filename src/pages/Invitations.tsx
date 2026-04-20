import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Upload, Plus, Trash2, Mail, Users, FileSpreadsheet, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

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
  const companyId = profile?.company_id;

  const [draft, setDraft] = useState<InviteRow[]>([{ email: "" }]);
  const [parsing, setParsing] = useState(false);

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_for_invite", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
    mutationFn: async (invites: InviteRow[]) => {
      const cleaned = invites
        .map((i) => ({ ...i, email: i.email.trim().toLowerCase() }))
        .filter((i) => i.email.includes("@"));
      if (cleaned.length === 0) throw new Error("Нет валидных email");
      const { data, error } = await supabase.rpc("bulk_invite_employees" as any, { _invites: cleaned });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (res: any) => {
      toast.success(`Создано: ${res.created}, пропущено: ${res.skipped}`);
      setDraft([{ email: "" }]);
      queryClient.invalidateQueries({ queryKey: ["invitations", companyId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
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
        toast.error("Не найдено валидных email. Колонки: email, full_name, department");
        return;
      }
      setDraft(parsed);
      toast.success(`Загружено ${parsed.length} строк`);
    } catch (e: any) {
      toast.error("Не удалось прочитать файл: " + e.message);
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
    s === "claimed" ? "Принято" : s === "cancelled" ? "Отменено" : "Ожидает";

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Приглашения сотрудников</h1>
          <p className="text-muted-foreground text-sm">
            Массовый импорт XLSX/CSV или ручной список. Сотрудник заявит профиль при регистрации.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-foreground">Новые приглашения</h3>
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
                Загрузить XLSX/CSV
              </span>
            </label>
            <Button size="sm" variant="outline" onClick={() => setDraft([...draft, { email: "" }])}>
              <Plus className="w-4 h-4 mr-1" /> Строка
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Email *</th>
                <th className="py-2 pr-2">ФИО</th>
                <th className="py-2 pr-2">Должность</th>
                <th className="py-2 pr-2">Отдел</th>
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
          Отправить приглашения
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Список приглашений ({invitations.length})</h3>
        </div>

        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Пока нет приглашений</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">ФИО</th>
                  <th className="py-2 pr-2">Отдел</th>
                  <th className="py-2 pr-2">Статус</th>
                  <th className="py-2 pr-2">Создано</th>
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
                      {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: ru })}
                    </td>
                    <td className="py-2">
                      {inv.status === "pending" && (
                        <button
                          onClick={() => cancelMutation.mutate(inv.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-destructive"
                          title="Отменить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
