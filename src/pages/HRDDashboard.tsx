import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravel } from "@/integrations/laravel/client";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { useAuth } from "@/contexts/AuthContext";
import { Users, TrendingUp, Shield, BarChart3, Search, ChevronDown, Loader2, GitCompareArrows, X, Briefcase, Mail, Plus, Trash2, Check, Route } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import HRDCareerTracksAnalytics from "@/components/HRDCareerTracksAnalytics";
import HRDEmployeeMap from "@/components/HRDEmployeeMap";
import type { AppRole } from "@/hooks/useUserProfile";
import { useTranslation } from "react-i18next";

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
  email?: string | null;
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

const useRoleBadge = () => {
  const { t } = useTranslation("manager");
  const roleBadge: Record<AppRole, { label: string; cls: string }> = {
    employee: { label: t("hrdDashboard.roles.employee"), cls: "bg-secondary text-secondary-foreground" },
    manager: { label: t("hrdDashboard.roles.manager"), cls: "bg-info/10 text-info" },
    hrd: { label: t("hrdDashboard.roles.hrd"), cls: "bg-warning/10 text-warning" },
    company_admin: { label: t("hrdDashboard.roles.company_admin"), cls: "bg-primary/10 text-primary" },
    superadmin: { label: t("hrdDashboard.roles.superadmin"), cls: "bg-destructive/10 text-destructive" },
  };
  return roleBadge;
};

type RoleFilter = "all" | AppRole;

const useEmployeesWithRoles = (companyId: string | null | undefined) =>
  useQuery({
    queryKey: ["hrd_employees", companyId],
    queryFn: async () => {
      if (!companyId) return [] as EmployeeWithRole[];
      const [profilesRes, rolesRes, emailsRes] = await Promise.all([
        laravelDb
          .from("profiles")
          .select("user_id, full_name, position, position_id, pending_position_id, department, overall_score, role_readiness")
          .eq("company_id", companyId),
        laravelDb.from("user_roles").select("user_id, role"),
        laravel.get<{ data: any[] } | any[]>(`/profiles?per_page=500&company_id=${encodeURIComponent(companyId)}`),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      // Confine role/email lookups to profile.user_id set — defense in depth
      // in case any of the underlying queries ever escapes the company scope.
      const companyUserIds = new Set((profilesRes.data || []).map((p: any) => p.user_id));

      const roleMap = new Map<string, AppRole>();
      for (const r of rolesRes.data) {
        if (!companyUserIds.has(r.user_id)) continue;
        const current = roleMap.get(r.user_id);
        const priority: Record<string, number> = { hrd: 3, manager: 2, employee: 1 };
        if (!current || priority[r.role as string] > (priority[current] || 0)) {
          roleMap.set(r.user_id, r.role as AppRole);
        }
      }

      const emailMap = new Map<string, string>();
      const emailItems: any[] = Array.isArray(emailsRes.data)
        ? (emailsRes.data as any[])
        : (((emailsRes.data as any)?.data) || []);
      for (const p of emailItems) {
        if (p?.user_id && p?.email && companyUserIds.has(p.user_id)) {
          emailMap.set(p.user_id, p.email);
        }
      }

      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || ("employee" as AppRole),
        email: emailMap.get(p.user_id) || null,
      })) as EmployeeWithRole[];
    },
    enabled: !!companyId,
  });


const usePositions = () =>
  useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("positions").select("*").order("title");
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
  const { t } = useTranslation("manager");
  const { data: competencies = [], isLoading } = useQuery({
    queryKey: ["competencies", employee.user_id],
    queryFn: async () => {
      const { data, error } = await laravelDb
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
            <h2 className="text-lg font-semibold text-foreground">{t("hrdDashboard.comparison.title")}</h2>
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
            <p className="text-sm font-medium text-foreground">{t("hrdDashboard.comparison.match")}</p>
            <p className="text-xs text-muted-foreground">
              {matchPercent >= 80
                ? t("hrdDashboard.comparison.high")
                : matchPercent >= 50
                ? t("hrdDashboard.comparison.medium")
                : t("hrdDashboard.comparison.low")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : radarData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t("hrdDashboard.comparison.noData")}
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
                  <Radar name={t("hrdDashboard.comparison.positionBenchmark")} dataKey="required" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name={t("hrdDashboard.comparison.employee")} dataKey="actual" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.2} strokeWidth={2} />
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
                    <th className="text-left py-2 px-4 text-muted-foreground font-medium">{t("hrdDashboard.comparison.competency")}</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">{t("hrdDashboard.comparison.benchmark")}</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">{t("hrdDashboard.comparison.employee")}</th>
                    <th className="text-center py-2 px-4 text-muted-foreground font-medium">{t("hrdDashboard.comparison.diff")}</th>
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
  const { t } = useTranslation("manager");
  const roleBadge = useRoleBadge();
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
      const { data, error } = await laravelDb.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Email domain mappings
  const { data: mappings = [] } = useQuery({
    queryKey: ["email_domain_mappings"],
    queryFn: async () => {
      const { data, error } = await laravelDb
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
      const { error } = await laravelDb
        .from("profiles")
        .update({ position_id: positionId, pending_position_id: null } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      toast.success(t("hrdDashboard.toast.positionConfirmed"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectPositionMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await laravelDb.from("profiles").update({ pending_position_id: null } as any).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      toast.success(t("hrdDashboard.toast.requestRejected"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addMappingMutation = useMutation({
    mutationFn: async () => {
      if (!newMapDomain.trim() || !newMapPositionId) throw new Error(t("hrdDashboard.errors.specifyDomainPosition"));
      if (!user || !myProfile?.company_id) throw new Error(t("hrdDashboard.errors.noCompany"));
      const domain = newMapDomain.trim().toLowerCase().replace(/^@/, "");
      const { error } = await laravelDb.from("email_domain_position_mappings").insert({
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
      toast.success(t("hrdDashboard.toast.mappingAdded"));
    },
    onError: (err: any) => toast.error(err.message?.includes("duplicate") ? t("hrdDashboard.errors.domainDuplicate") : err.message),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("email_domain_position_mappings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_domain_mappings"] });
      toast.success(t("hrdDashboard.toast.mappingDeleted"));
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await laravelRpc("assign_role", {
        _target_user_id: userId,
        _new_role: newRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      toast.success(t("hrdDashboard.toast.roleUpdated"));
    },
    onError: (err: any) => toast.error(err.message || t("hrdDashboard.toast.roleError")),
  });

  const assignPositionMutation = useMutation({
    mutationFn: async ({ userId, positionId }: { userId: string; positionId: string | null }) => {
      const { error } = await laravelDb
        .from("profiles")
        .update({ position_id: positionId } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hrd_employees"] });
      setShowPositionMenu(null);
      toast.success(t("hrdDashboard.toast.positionAssigned"));
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
    { name: t("hrdDashboard.roleDistItems.employees"), value: roleCounts.employee, color: "hsl(var(--primary))" },
    { name: t("hrdDashboard.roleDistItems.managers"), value: roleCounts.manager, color: "hsl(var(--info))" },
    { name: t("hrdDashboard.roleDistItems.hrd"), value: roleCounts.hrd, color: "hsl(var(--warning))" },
  ];

  const deptMap = new Map<string, { count: number; totalScore: number }>();
  employees.forEach((e) => {
    const dept = e.department || t("hrdDashboard.noDept");
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
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero p-6 md:p-8 shadow-elevated">
        <div className="absolute inset-0 gradient-glow opacity-60 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 backdrop-blur-md flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t("hrdDashboard.hero.title")}</h1>
              <p className="text-muted-foreground mt-1">{t("hrdDashboard.hero.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => (window.location.href = "/risk-analytics")} variant="outline" className="bg-background/40 backdrop-blur-sm">
              {t("hrdDashboard.hero.risksBtn")}
            </Button>
            <Button onClick={() => (window.location.href = "/recognition")} className="gradient-primary text-primary-foreground shadow-glow">
              {t("hrdDashboard.hero.recognitionBtn")}
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics — glass KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="glass rounded-xl p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Users className="w-4 h-4 text-primary" /> {t("hrdDashboard.metrics.employees")}
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{employees.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("hrdDashboard.metrics.managersCount", { count: roleCounts.manager })}</div>
        </div>
        <div className="glass rounded-xl p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-info" /> {t("hrdDashboard.metrics.avgScore")}
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{avgScore}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("hrdDashboard.metrics.perCompany")}</div>
        </div>
        <div className="glass rounded-xl p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Shield className="w-4 h-4 text-warning" /> {t("hrdDashboard.metrics.managersLabel")}
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{roleCounts.manager}</div>
        </div>
        <div className="glass rounded-xl p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="w-4 h-4 text-success" /> {t("hrdDashboard.metrics.departments")}
          </div>
          <div className="mt-2 text-3xl font-bold text-foreground">{deptMap.size}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role distribution */}
        <div className="glass rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">{t("hrdDashboard.charts.roleDistribution")}</h3>
          {roleDistribution.some((r) => r.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={roleDistribution.filter((r) => r.value > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                    {roleDistribution.filter((r) => r.value > 0).map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
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
            <p className="text-sm text-muted-foreground text-center py-8">{t("hrdDashboard.charts.noData")}</p>
          )}
        </div>

        {/* Department comparison */}
        <div className="lg:col-span-2 glass rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">{t("hrdDashboard.charts.avgScoreByDept")}</h3>
          {departmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name={t("hrdDashboard.charts.avgScoreBar")} />
                <Bar dataKey="employees" fill="hsl(var(--info))" radius={[6, 6, 0, 0]} name={t("hrdDashboard.charts.employeesBar")} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t("hrdDashboard.charts.noData")}</p>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
        {([
          { key: "employees", label: t("hrdDashboard.tabs.employees"), icon: Users, count: employees.length },
          { key: "map", label: t("hrdDashboard.tabs.map"), icon: GitCompareArrows, count: 0 },
          { key: "tracks", label: t("hrdDashboard.tabs.tracks"), icon: Route, count: 0 },
          { key: "requests", label: t("hrdDashboard.tabs.requests"), icon: Briefcase, count: pendingRequests.length },
          { key: "mappings", label: t("hrdDashboard.tabs.mappings"), icon: Mail, count: mappings.length },
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

      {activePanel === "map" && <HRDEmployeeMap />}

      {activePanel === "tracks" && <HRDCareerTracksAnalytics />}

      {/* Pending position requests panel */}
      {activePanel === "requests" && (
        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold text-foreground">{t("hrdDashboard.requests.title")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("hrdDashboard.requests.subtitle")}
            </p>
          </div>
          {pendingRequests.length === 0 ? (
            <div className="p-12 text-center">
              <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">{t("hrdDashboard.requests.empty")}</p>
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
                        <Link to={`/users/${emp.user_id}`} className="font-medium text-foreground hover:text-primary hover:underline truncate block">
                          {emp.full_name}
                        </Link>
                        {emp.email && (
                          <a href={`mailto:${emp.email}`} className="text-xs text-primary hover:underline block truncate">{emp.email}</a>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {t("hrdDashboard.requests.claimedPosition")} <span className="text-foreground font-medium">{requestedPos?.title || t("hrdDashboard.requests.positionDeleted")}</span>
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
                          title={t("hrdDashboard.requests.changePositionTitle")}
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
                        <Check className="w-3.5 h-3.5" /> {t("hrdDashboard.requests.confirm")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => rejectPositionMutation.mutate(emp.user_id)}
                        disabled={rejectPositionMutation.isPending}
                        className="text-destructive hover:text-destructive gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> {t("hrdDashboard.requests.reject")}
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
            <h3 className="font-semibold text-foreground">{t("hrdDashboard.mappings.title")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("hrdDashboard.mappings.subtitle")}
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
                <option value="">{t("hrdDashboard.mappings.selectPosition")}</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.department ? ` · ${p.department}` : ""}</option>
                ))}
              </select>
              <Button
                onClick={() => addMappingMutation.mutate()}
                disabled={addMappingMutation.isPending || !newMapDomain.trim() || !newMapPositionId}
                className="gap-1"
              >
                <Plus className="w-4 h-4" /> {t("hrdDashboard.mappings.add")}
              </Button>
            </div>
          </div>
          {mappings.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">{t("hrdDashboard.mappings.empty")}</p>
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
            <h3 className="font-semibold text-foreground">{t("hrdDashboard.table.title")}</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("hrdDashboard.table.searchPlaceholder")}
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
                    {r === "all" ? t("hrdDashboard.table.filterAll") : roleBadge[r].label}
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
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colEmployee")}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colPosition")}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colDept")}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colRole")}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colScore")}</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("hrdDashboard.table.colMatch")}</th>
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
                          <Link to={`/users/${emp.user_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                            {emp.full_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{emp.position || "—"}</p>
                          {emp.email && (
                            <a href={`mailto:${emp.email}`} className="text-xs text-primary hover:underline block truncate max-w-[220px]">{emp.email}</a>
                          )}
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
                          {empPosition ? empPosition.title : t("hrdDashboard.table.noPosition")} <ChevronDown className="w-3 h-3" />
                        </button>
                        {showPositionMenu === emp.user_id && (
                          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-elevated z-10 py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                            <button
                              onClick={() => {
                                assignPositionMutation.mutate({ userId: emp.user_id, positionId: null });
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors text-muted-foreground"
                            >
                              {t("hrdDashboard.table.removePosition")}
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
                              <p className="px-3 py-2 text-xs text-muted-foreground">{t("hrdDashboard.table.noPositions")}</p>
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
                          {t("hrdDashboard.table.compare")}
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
                    {employees.length === 0 ? t("hrdDashboard.table.noEmployees") : t("hrdDashboard.table.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-sm text-muted-foreground border-t border-border">
          {t("hrdDashboard.table.showing", { shown: filtered.length, total: employees.length })}
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
