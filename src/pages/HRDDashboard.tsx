import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, TrendingUp, Shield, BarChart3, Search, ChevronDown, Loader2, GitCompareArrows, X, Briefcase, Mail, Plus, Trash2, Check, Route } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import HRDCareerTracksAnalytics from "@/components/HRDCareerTracksAnalytics";
import HRDEmployeeMap from "@/components/HRDEmployeeMap";
import type { AppRole } from "@/hooks/useUserProfile";

interface EmployeeWithRole {
  user_id: string;
  full_name: string;
  position: string | null;
  position_id: string | null;
  pending_position_id: string | null;
  department: string | null;
  overall_score: number | null;
  role_readiness: number | null;
  role: AppRole;
}

interface Position {
  id: string;
  title: string;
  department: string | null;
  competency_profile: any;
  psychological_profile: any;
}

interface Competency {
  skill_name: string;
  skill_value: number;
}

const roleBadge: Record<AppRole, { label: string; cls: string }> = {
  employee: { label: "Сотрудник", cls: "bg-secondary text-secondary-foreground" },
  manager: { label: "Руководитель", cls: "bg-info/10 text-info" },
  hrd: { label: "HRD", cls: "bg-warning/10 text-warning" },
  company_admin: { label: "Админ компании", cls: "bg-primary/10 text-primary" },
  superadmin: { label: "Суперадмин", cls: "bg-destructive/10 text-destructive" },
};

type RoleFilter = "all" | AppRole;

const useEmployeesWithRoles = () =>
  useQuery({
    queryKey: ["hrd_employees"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, position, position_id, pending_position_id, department, overall_score, role_readiness"),
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

      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || ("employee" as AppRole),
      })) as EmployeeWithRole[];
    },
  });

const usePositions = () =>
  useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("title");
      if (error) throw error;
      return (data || []) as Position[];
    },
  });

// Competency comparison modal
const CompetencyComparisonModal = ({
  employee,
  position,
  onClose,
}: {
  employee: EmployeeWithRole;
  position: Position;
  onClose: () => void;
}) => {
  const { data: competencies = [], isLoading } = useQuery({
    queryKey: ["competencies", employee.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competencies")
        .select("skill_name, skill_value")
        .eq("user_id", employee.user_id);
      if (error) throw error;
      return (data || []) as Competency[];
    },
  });

  const posProfile: { name: string; required_level: number }[] = Array.isArray(position.competency_profile)
    ? position.competency_profile
    : [];

  // Build comparison data
  const allSkills = new Set<string>();
  posProfile.forEach((p) => allSkills.add(p.name));
  competencies.forEach((c) => allSkills.add(c.skill_name));

  const radarData = Array.from(allSkills).map((skill) => {
    const required = posProfile.find((p) => p.name === skill)?.required_level || 0;
    const actual = competencies.find((c) => c.skill_name === skill)?.skill_value || 0;
    return { skill, required, actual };
  });

  const totalRequired = radarData.reduce((s, d) => s + d.required, 0);
  const totalActual = radarData.reduce((s, d) => s + d.actual, 0);
  const matchPercent = totalRequired > 0 ? Math.round((totalActual / totalRequired) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Сравнение компетенций</h2>
            <p className="text-sm text-muted-foreground">
              {employee.full_name} → {position.title}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Match score */}
        <div className="flex items-center gap-4">
          <div
            className={`text-3xl font-bold ${
              matchPercent >= 80 ? "text-success" : matchPercent >= 50 ? "text-warning" : "text-destructive"
            }`}
          >
            {matchPercent}%
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Соответствие должности</p>
            <p className="text-xs text-muted-foreground">
              {matchPercent >= 80
                ? "Высокое соответствие — сотрудник готов к должности"
                : matchPercent >= 50
                ? "Среднее соответствие — требуется развитие отдельных компетенций"
                : "Низкое соответствие — необходима серьёзная подготовка"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : radarData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Нет данных для сравнения. Убедитесь, что у должности задан профиль компетенций.
          </p>
        ) : (
          <>
            {/* Radar chart */}
            <div className="bg-secondary/30 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} domain={[0, 10]} />
                  <Radar name="Эталон должности" dataKey="required" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Сотрудник" dataKey="actual" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.2} strokeWidth={2} />
                  <Legend />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Detail table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/30 border-b border-border">
                    <th className="text-left py-2 px-4 text-muted-foreground font-medium">Компетенция</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">Эталон</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">Сотрудник</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {radarData.map((d) => {
                    const diff = d.actual - d.required;
                    return (
                      <tr key={d.skill} className="border-b border-border/50">
                        <td className="py-2 px-4 font-medium text-foreground">{d.skill}</td>
                        <td className="py-2 px-4 text-center text-muted-foreground">{d.required}</td>
                        <td className="py-2 px-4 text-center text-foreground">{d.actual}</td>
                        <td className="py-2 px-4 text-center">
                          <span
                            className={`font-semibold ${
                              diff >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const HRDDashboard = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showRoleMenu, setShowRoleMenu] = useState<string | null>(null);
  const [showPositionMenu, setShowPositionMenu] = useState<string | null>(null);
  const [comparisonTarget, setComparisonTarget] = useState<{ emp: EmployeeWithRole; pos: Position } | null>(null);
  const [activePanel, setActivePanel] = useState<"employees" | "map" | "requests" | "mappings" | "tracks">("employees");
  const [newMapDomain, setNewMapDomain] = useState("");
  const [newMapPositionId, setNewMapPositionId] = useState("");
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useEmployeesWithRoles();
  const { data: positions = [] } = usePositions();

  // User's company id (for domain mapping inserts)
  const { data: myProfile } = useQuery({
    queryKey: ["my_profile_company", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Email domain mappings
  const { data: mappings = [] } = useQuery({
    queryKey: ["email_domain_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_domain_position_mappings")
        .select("id, email_domain, position_id, positions(title, department)")
        .order("email_domain");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const pendingRequests = employees.filter((e) => e.pending_position_id);

  const approvePositionMutation = useMutation({
    mutationFn: async ({ userId, positionId }: { userId: string; positionId: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ position_id: positionId, pending_position_id: null } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      toast.success("Должность подтверждена");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectPositionMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ pending_position_id: null } as any).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      toast.success("Заявка отклонена");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addMappingMutation = useMutation({
    mutationFn: async () => {
      if (!newMapDomain.trim() || !newMapPositionId) throw new Error("Укажите домен и должность");
      if (!user || !myProfile?.company_id) throw new Error("Не определена компания");
      const domain = newMapDomain.trim().toLowerCase().replace(/^@/, "");
      const { error } = await supabase.from("email_domain_position_mappings").insert({
        company_id: myProfile.company_id,
        email_domain: domain,
        position_id: newMapPositionId,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_domain_mappings"] });
      setNewMapDomain("");
      setNewMapPositionId("");
      toast.success("Маппинг добавлен");
    },
    onError: (err: any) => toast.error(err.message?.includes("duplicate") ? "Этот домен уже сопоставлен" : err.message),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_domain_position_mappings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_domain_mappings"] });
      toast.success("Маппинг удалён");
    },
  });

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
    onError: (err: any) => toast.error(err.message || "Ошибка при назначении роли"),
  });

  const assignPositionMutation = useMutation({
    mutationFn: async ({ userId, positionId }: { userId: string; positionId: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ position_id: positionId } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      setShowPositionMenu(null);
      toast.success("Должность назначена");
    },
    onError: (err: any) => toast.error(err.message),
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

  const avgScore =
    employees.length > 0
      ? Math.round(employees.reduce((s, e) => s + (e.overall_score || 0), 0) / employees.length)
      : 0;

  const getPositionForEmployee = (emp: EmployeeWithRole) =>
    positions.find((p) => p.id === emp.position_id);

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

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
        {([
          { key: "employees", label: "Сотрудники", icon: Users, count: employees.length },
          { key: "tracks", label: "Карьерные треки", icon: Route, count: 0 },
          { key: "requests", label: "Заявки на должность", icon: Briefcase, count: pendingRequests.length },
          { key: "mappings", label: "Маппинг доменов", icon: Mail, count: mappings.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setActivePanel(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              activePanel === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                activePanel === t.key ? "bg-primary-foreground/20" : "bg-background"
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {activePanel === "tracks" && <HRDCareerTracksAnalytics />}

      {/* Pending position requests panel */}
      {activePanel === "requests" && (
        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold text-foreground">Заявки на подтверждение должности</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Сотрудники, выбравшие свою должность вручную при регистрации. Подтвердите, измените или отклоните.
            </p>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="p-12 text-center">
              <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Нет заявок на подтверждение</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pendingRequests.map((emp) => {
                const requestedPos = positions.find((p) => p.id === emp.pending_position_id);
                const initials = emp.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2);
                return (
                  <div key={emp.user_id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-semibold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Заявленная должность: <span className="text-foreground font-medium">{requestedPos?.title || "— должность удалена —"}</span>
                          {requestedPos?.department && <span className="ml-1">· {requestedPos.department}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {/* Change position dropdown */}
                      <div className="relative">
                        <select
                          value={emp.pending_position_id || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              approvePositionMutation.mutate({ userId: emp.user_id, positionId: e.target.value });
                            }
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 max-w-[180px]"
                          title="Изменить должность"
                        >
                          {positions.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => requestedPos && approvePositionMutation.mutate({ userId: emp.user_id, positionId: requestedPos.id })}
                        disabled={!requestedPos || approvePositionMutation.isPending}
                        className="gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Подтвердить
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => rejectPositionMutation.mutate(emp.user_id)}
                        disabled={rejectPositionMutation.isPending}
                        className="text-destructive hover:text-destructive gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Отклонить
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Email domain mappings panel */}
      {activePanel === "mappings" && (
        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold text-foreground">Автоназначение должности по email</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Сотрудники с email указанного домена будут автоматически получать выбранную должность без ручного подтверждения.
            </p>
          </div>
          <div className="p-5 border-b border-border bg-secondary/20">
            <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <input
                type="text"
                value={newMapDomain}
                onChange={(e) => setNewMapDomain(e.target.value)}
                placeholder="example.com"
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
              <select
                value={newMapPositionId}
                onChange={(e) => setNewMapPositionId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">— Выберите должность —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.department ? ` · ${p.department}` : ""}</option>
                ))}
              </select>
              <Button
                onClick={() => addMappingMutation.mutate()}
                disabled={addMappingMutation.isPending || !newMapDomain.trim() || !newMapPositionId}
                className="gap-1"
              >
                <Plus className="w-4 h-4" /> Добавить
              </Button>
            </div>
          </div>
          {mappings.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Маппингов пока нет</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {mappings.map((m: any) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono text-foreground">@{m.email_domain}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      → {m.positions?.title || "—"}{m.positions?.department ? ` · ${m.positions.department}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteMappingMutation.mutate(m.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Employee table */}
      {activePanel === "employees" && (
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
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Должность</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Отдел</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Роль</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Балл</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Соответствие</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const rBadge = roleBadge[emp.role];
                const initials = emp.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2);
                const empPosition = getPositionForEmployee(emp);

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
                    {/* Position assignment */}
                    <td className="py-3 px-4">
                      <div className="relative">
                        <button
                          onClick={() => setShowPositionMenu(showPositionMenu === emp.user_id ? null : emp.user_id)}
                          className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity bg-secondary text-secondary-foreground"
                        >
                          {empPosition ? empPosition.title : "Не назначена"} <ChevronDown className="w-3 h-3" />
                        </button>
                        {showPositionMenu === emp.user_id && (
                          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-elevated z-10 py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                            <button
                              onClick={() => {
                                assignPositionMutation.mutate({ userId: emp.user_id, positionId: null });
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors text-muted-foreground"
                            >
                              — Снять должность
                            </button>
                            {positions.map((pos) => (
                              <button
                                key={pos.id}
                                onClick={() => {
                                  assignPositionMutation.mutate({ userId: emp.user_id, positionId: pos.id });
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors flex items-center justify-between ${
                                  emp.position_id === pos.id ? "text-primary font-semibold" : "text-foreground"
                                }`}
                              >
                                <span>{pos.title}</span>
                                {emp.position_id === pos.id && <span className="text-primary">✓</span>}
                              </button>
                            ))}
                            {positions.length === 0 && (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Нет должностей. Создайте в разделе «Должности».</p>
                            )}
                          </div>
                        )}
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
                      {empPosition ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setComparisonTarget({ emp, pos: empPosition })}
                          className="text-xs gap-1"
                        >
                          <GitCompareArrows className="w-3.5 h-3.5" />
                          Сравнить
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
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
      )}

      {/* Comparison modal */}
      {comparisonTarget && (
        <CompetencyComparisonModal
          employee={comparisonTarget.emp}
          position={comparisonTarget.pos}
          onClose={() => setComparisonTarget(null)}
        />
      )}
    </div>
  );
};

export default HRDDashboard;
