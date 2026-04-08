import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, Shield, BarChart3, Search, UserPlus, Eye, Edit, ChevronDown, Loader2 } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserProfile";

interface EmployeeWithRole {
  user_id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  overall_score: number | null;
  role_readiness: number | null;
  role: AppRole;
}

const roleBadge: Record<AppRole, { label: string; cls: string }> = {
  employee: { label: "Сотрудник", cls: "bg-secondary text-secondary-foreground" },
  manager: { label: "Руководитель", cls: "bg-info/10 text-info" },
  hrd: { label: "HRD", cls: "bg-warning/10 text-warning" },
  superadmin: { label: "Суперадмин", cls: "bg-destructive/10 text-destructive" },
};

type RoleFilter = "all" | AppRole;

const useEmployeesWithRoles = () =>
  useQuery({
    queryKey: ["hrd_employees"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, position, department, overall_score, role_readiness"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map<string, AppRole>();
      for (const r of rolesRes.data) {
        const current = roleMap.get(r.user_id);
        const priority: Record<string, number> = { hrd: 3, manager: 2, employee: 1 };
        if (!current || priority[r.role as string] > (priority[current] || 0)) {
          roleMap.set(r.user_id, r.role as AppRole);
        }
      }

      return (profilesRes.data || []).map((p) => ({
        ...p,
        role: roleMap.get(p.user_id) || ("employee" as AppRole),
      })) as EmployeeWithRole[];
    },
  });

const HRDDashboard = () => {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showRoleMenu, setShowRoleMenu] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useEmployeesWithRoles();

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase.rpc("assign_role", {
        _target_user_id: userId,
        _new_role: newRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      toast.success("Роль успешно обновлена");
    },
    onError: (err: any) => {
      toast.error(err.message || "Ошибка при назначении роли");
    },
  });

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    setShowRoleMenu(null);
    assignRoleMutation.mutate({ userId, newRole });
  };

  const filtered = employees.filter((e) => {
    const matchSearch =
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.department || "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = {
    employee: employees.filter((e) => e.role === "employee").length,
    manager: employees.filter((e) => e.role === "manager").length,
    hrd: employees.filter((e) => e.role === "hrd").length,
  };

  const roleDistribution = [
    { name: "Сотрудники", value: roleCounts.employee, color: "hsl(var(--primary))" },
    { name: "Руководители", value: roleCounts.manager, color: "hsl(var(--info))" },
    { name: "HRD", value: roleCounts.hrd, color: "hsl(var(--warning))" },
  ];

  // Group by department
  const deptMap = new Map<string, { count: number; totalScore: number }>();
  employees.forEach((e) => {
    const dept = e.department || "Без отдела";
    const cur = deptMap.get(dept) || { count: 0, totalScore: 0 };
    cur.count++;
    cur.totalScore += e.overall_score || 0;
    deptMap.set(dept, cur);
  });
  const departmentData = Array.from(deptMap.entries()).map(([name, d]) => ({
    name,
    employees: d.count,
    avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0,
  }));

  const avgScore = employees.length > 0 ? Math.round(employees.reduce((s, e) => s + (e.overall_score || 0), 0) / employees.length) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Панель администратора HRD 🛡️</h1>
          <p className="text-muted-foreground mt-1">Управление сотрудниками, ролями и развитием</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Всего сотрудников" value={String(employees.length)} subtitle={`${roleCounts.manager} руководителей`} icon={Users} />
        <MetricCard title="Средний балл" value={String(avgScore)} subtitle="По всей компании" icon={TrendingUp} />
        <MetricCard title="Руководителей" value={String(roleCounts.manager)} icon={Shield} />
        <MetricCard title="Отделов" value={String(deptMap.size)} icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role distribution */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Распределение ролей</h3>
          {roleDistribution.some((r) => r.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={roleDistribution.filter((r) => r.value > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {roleDistribution.filter((r) => r.value > 0).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {roleDistribution.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                      <span className="text-muted-foreground">{r.name}</span>
                    </div>
                    <span className="font-medium text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </div>

        {/* Department comparison */}
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Средний балл по отделам</h3>
          {departmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Средний балл" />
                <Bar dataKey="employees" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} name="Сотрудников" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </div>
      </div>

      {/* Employee table */}
      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="font-semibold text-foreground">Все сотрудники</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или отделу..."
                  className="pl-10 pr-4 py-2 w-64 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["all", "employee", "manager", "hrd"] as RoleFilter[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      roleFilter === r ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {r === "all" ? "Все" : roleBadge[r].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Сотрудник</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Отдел</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Роль</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Балл</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Готовность</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const rBadge = roleBadge[emp.role];
                const initials = emp.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2);
                return (
                  <tr key={emp.user_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-semibold">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{emp.full_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.position || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground">{emp.department || "—"}</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <button
                          onClick={() => setShowRoleMenu(showRoleMenu === emp.user_id ? null : emp.user_id)}
                          disabled={assignRoleMutation.isPending}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${rBadge.cls}`}
                        >
                          {assignRoleMutation.isPending && assignRoleMutation.variables?.userId === emp.user_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>{rBadge.label} <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                        {showRoleMenu === emp.user_id && (
                          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-elevated z-10 py-1 min-w-[160px]">
                            {(["employee", "manager", "hrd"] as AppRole[]).map((r) => (
                              <button
                                key={r}
                                onClick={() => handleRoleChange(emp.user_id, r)}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center justify-between ${
                                  emp.role === r ? "text-primary font-semibold" : "text-foreground"
                                }`}
                              >
                                <span>{roleBadge[r].label}</span>
                                {emp.role === r && <span className="text-primary">✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-foreground">{emp.overall_score || 0}</span>
                      <span className="text-muted-foreground">/100</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${emp.role_readiness || 0}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground">{emp.role_readiness || 0}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    {employees.length === 0 ? "Нет сотрудников в системе" : "Ничего не найдено"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-sm text-muted-foreground border-t border-border">
          Показано {filtered.length} из {employees.length} сотрудников
        </div>
      </div>
    </div>
  );
};

export default HRDDashboard;
