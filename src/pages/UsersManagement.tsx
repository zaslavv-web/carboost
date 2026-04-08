import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Users, Search } from "lucide-react";
import { useState } from "react";
import type { AppRole } from "@/hooks/useUserProfile";

const roleBadge: Record<string, { label: string; cls: string }> = {
  employee: { label: "Сотрудник", cls: "bg-secondary text-secondary-foreground" },
  manager: { label: "Руководитель", cls: "bg-info/10 text-info" },
  hrd: { label: "HRD", cls: "bg-warning/10 text-warning" },
  superadmin: { label: "Суперадмин", cls: "bg-destructive/10 text-destructive" },
};

const UsersManagement = () => {
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
        const priority: Record<string, number> = { superadmin: 4, hrd: 3, manager: 2, employee: 1 };
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

  const filtered = users.filter((u: any) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleImpersonate = (userId: string, name: string) => {
    startImpersonation(userId, name);
    navigate("/");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Управление пользователями</h1>
        <p className="text-muted-foreground text-sm mt-1">Просмотр от имени любого пользователя для диагностики</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или отделу..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Отдел</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Роль</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => {
                const badge = roleBadge[u.role] || roleBadge.employee;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">{u.position || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">{u.department || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {u.is_verified ? "Верифицирован" : "Ожидает"}
                      </span>
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
                );
              })}
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
