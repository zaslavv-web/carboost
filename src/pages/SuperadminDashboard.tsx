import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Users, ShieldCheck, Clock, UserCheck } from "lucide-react";
import type { UserProfile, AppRole } from "@/hooks/useUserProfile";

const roleLabelMap: Record<string, string> = {
  employee: "Сотрудник",
  manager: "Руководитель",
  hrd: "HRD",
  superadmin: "Суперадмин",
};

interface ProfileWithRole extends UserProfile {
  role: AppRole;
}

const SuperadminDashboard = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const { data: allProfiles = [], isLoading } = useQuery({
    queryKey: ["superadmin_profiles"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("*");
      if (rolesErr) throw rolesErr;
      const roleMap: Record<string, AppRole> = {};
      (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role as AppRole; });
      return (profiles || []).map((p: any) => ({ ...p, role: roleMap[p.user_id] || "employee" })) as ProfileWithRole[];
    },
  });

  const pendingUsers = allProfiles.filter((p) => !p.is_verified);
  const verifiedUsers = allProfiles.filter((p) => p.is_verified);

  const verifyMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("verify_user", { _target_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
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
      queryClient.invalidateQueries({ queryKey: ["superadmin_profiles"] });
      toast.success("Роль изменена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Панель суперадмина</h1>
        <p className="text-muted-foreground text-sm mt-1">Верификация и управление пользователями</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{allProfiles.length}</p>
              <p className="text-xs text-muted-foreground">Всего</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingUsers.length}</p>
              <p className="text-xs text-muted-foreground">Ожидают</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{verifiedUsers.length}</p>
              <p className="text-xs text-muted-foreground">Верифицированы</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{allProfiles.filter(p => p.role === "superadmin").length}</p>
              <p className="text-xs text-muted-foreground">Суперадмины</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("pending")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "pending" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        >
          Ожидают верификации ({pendingUsers.length})
        </button>
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        >
          Все пользователи ({allProfiles.length})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "pending" ? (
        <div className="space-y-3">
          {pendingUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Нет пользователей, ожидающих верификации</div>
          )}
          {pendingUsers.map((user) => (
            <div key={user.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{user.full_name}</p>
                <p className="text-sm text-muted-foreground">Запрошена роль: <span className="font-medium text-foreground">{roleLabelMap[user.requested_role] || user.requested_role}</span></p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => verifyMutation.mutate(user.user_id)}
                  disabled={verifyMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success text-sm font-medium hover:bg-success/20 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Подтвердить
                </button>
                <button
                  onClick={() => rejectMutation.mutate(user.user_id)}
                  disabled={rejectMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {allProfiles.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{user.full_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.is_verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {user.is_verified ? "Верифицирован" : "Ожидает"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => assignRoleMutation.mutate({ userId: user.user_id, role: e.target.value as AppRole })}
                      className="px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
                    >
                      {Object.entries(roleLabelMap).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {!user.is_verified && (
                      <button
                        onClick={() => verifyMutation.mutate(user.user_id)}
                        className="text-xs text-primary hover:underline"
                      >
                        Верифицировать
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
  );
};

export default SuperadminDashboard;
