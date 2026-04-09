import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Search, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserProfile";
import { useRealPrimaryRole } from "@/hooks/useUserProfile";

const roleLabelMap: Record<string, string> = {
  employee: "Сотрудник",
  manager: "Руководитель",
  hrd: "HRD",
  company_admin: "Админ компании",
  superadmin: "Суперадмин",
};

const roleBadge: Record<string, { label: string; cls: string }> = {
  employee: { label: "Сотрудник", cls: "bg-secondary text-secondary-foreground" },
  manager: { label: "Руководитель", cls: "bg-info/10 text-info" },
  hrd: { label: "HRD", cls: "bg-warning/10 text-warning" },
  company_admin: { label: "Админ компании", cls: "bg-primary/10 text-primary" },
  superadmin: { label: "Суперадмин", cls: "bg-destructive/10 text-destructive" },
};

type StatusFilter = "all" | "verified" | "pending";

const UsersManagement = () => {
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const realRole = useRealPrimaryRole();
  const isSuperadmin = realRole === "superadmin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name");
      if (error) return [];
      return data || [];
    },
    enabled: isSuperadmin,
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map<string, AppRole>();
      for (const r of rolesRes.data) {
        const current = roleMap.get(r.user_id);
        const priority: Record<string, number> = { superadmin: 5, company_admin: 4, hrd: 3, manager: 2, employee: 1 };
        if (!current || priority[r.role as string] > (priority[current] || 0)) {
          roleMap.set(r.user_id, r.role as AppRole);
        }
      }

      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || "employee",
      }));
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("verify_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success("Пользователь верифицирован");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("reject_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success("Пользователь отклонён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("assign_role", { _target_user_id: userId, _new_role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users_list"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success("Роль изменена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = users.filter((u: any) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.department || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "verified" && u.is_verified) ||
      (statusFilter === "pending" && !u.is_verified);
    const matchesCompany =
      companyFilter === "all" ||
      (companyFilter === "none" && !u.company_id) ||
      u.company_id === companyFilter;
    return matchesSearch && matchesStatus && matchesCompany;
  });

  const pendingCount = users.filter((u: any) => !u.is_verified).length;

  const handleImpersonate = (userId: string, name: string) => {
    startImpersonation(userId, name);
    navigate("/");
  };

  const statusFilters: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "Все", count: users.length },
    { value: "pending", label: "Ожидают", count: pendingCount },
    { value: "verified", label: "Верифицированы", count: users.length - pendingCount },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Управление пользователями</h1>
        <p className="text-muted-foreground text-sm mt-1">Верификация, роли и просмотр от имени пользователей</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или отделу..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="flex gap-2">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        {isSuperadmin && companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-secondary text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="all">Все компании</option>
            <option value="none">Без компании</option>
            {companies.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Пользователь</th>
                {isSuperadmin && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Компания</th>}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Отдел</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.position || "—"}</p>
                  </td>
                  {isSuperadmin && (
                    <td className="px-4 py-3 text-foreground text-xs">
                      {companies.find((c: any) => c.id === u.company_id)?.name || <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-foreground">{u.department || "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => assignRoleMutation.mutate({ userId: u.user_id, role: e.target.value as AppRole })}
                      className="px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
                    >
                      {Object.entries(roleLabelMap).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_verified ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                        Верифицирован
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => verifyMutation.mutate(u.user_id)}
                          disabled={verifyMutation.isPending}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Подтвердить
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(u.user_id)}
                          disabled={rejectMutation.isPending}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Отклонить
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleImpersonate(u.user_id, u.full_name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Войти как
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 text-sm text-muted-foreground border-t border-border">
            Показано {filtered.length} из {users.length} пользователей
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
