import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, TrendingUp, Users, Target, Loader2 } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";

const useAnalyticsData = () =>
  useQuery({
    queryKey: ["analytics_data"],
    queryFn: async () => {
      const [profilesRes, rolesRes, assessmentsRes, competenciesRes, goalsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, department, overall_score, role_readiness"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("assessments").select("user_id, score, assessment_type, created_at"),
        supabase.from("competencies").select("user_id, skill_name, skill_value"),
        supabase.from("career_goals").select("user_id, status, progress"),
      ]);
      return {
        profiles: profilesRes.data || [],
        roles: rolesRes.data || [],
        assessments: assessmentsRes.data || [],
        competencies: competenciesRes.data || [],
        goals: goalsRes.data || [],
      };
    },
  });

const Analytics = () => {
  const { data, isLoading } = useAnalyticsData();

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { profiles, roles, assessments, competencies, goals } = data;

  const avgScore = profiles.length > 0
    ? Math.round(profiles.reduce((s, p) => s + (p.overall_score || 0), 0) / profiles.length)
    : 0;

  const avgReadiness = profiles.length > 0
    ? Math.round(profiles.reduce((s, p) => s + (p.role_readiness || 0), 0) / profiles.length)
    : 0;

  const completedGoals = goals.filter((g) => g.status === "completed").length;
  const totalGoals = goals.length;

  // Department scores
  const deptMap = new Map<string, { count: number; totalScore: number; totalReadiness: number }>();
  profiles.forEach((p) => {
    const dept = p.department || "Без отдела";
    const cur = deptMap.get(dept) || { count: 0, totalScore: 0, totalReadiness: 0 };
    cur.count++;
    cur.totalScore += p.overall_score || 0;
    cur.totalReadiness += p.role_readiness || 0;
    deptMap.set(dept, cur);
  });
  const departmentData = Array.from(deptMap.entries()).map(([name, d]) => ({
    name,
    avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0,
    avgReadiness: d.count > 0 ? Math.round(d.totalReadiness / d.count) : 0,
    employees: d.count,
  }));

  // Competency averages
  const skillMap = new Map<string, { total: number; count: number }>();
  competencies.forEach((c) => {
    const cur = skillMap.get(c.skill_name) || { total: 0, count: 0 };
    cur.total += c.skill_value;
    cur.count++;
    skillMap.set(c.skill_name, cur);
  });
  const skillData = Array.from(skillMap.entries()).map(([name, d]) => ({
    name,
    value: Math.round(d.total / d.count),
  }));

  // Assessment trend (by month)
  const monthMap = new Map<string, { total: number; count: number }>();
  assessments.forEach((a) => {
    const month = a.created_at.slice(0, 7);
    const cur = monthMap.get(month) || { total: 0, count: 0 };
    cur.total += a.score || 0;
    cur.count++;
    monthMap.set(month, cur);
  });
  const trendData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      avgScore: d.count > 0 ? Math.round(d.total / d.count) : 0,
      assessments: d.count,
    }));

  // Role distribution
  const roleCounts: Record<string, number> = {};
  roles.forEach((r) => {
    roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
  });
  const roleLabels: Record<string, string> = { employee: "Сотрудники", manager: "Руководители", hrd: "HRD", superadmin: "Суперадмины" };
  const roleColors: Record<string, string> = {
    employee: "hsl(var(--primary))",
    manager: "hsl(var(--info))",
    hrd: "hsl(var(--warning))",
    superadmin: "hsl(var(--destructive))",
  };
  const roleDistribution = Object.entries(roleCounts).map(([role, value]) => ({
    name: roleLabels[role] || role,
    value,
    color: roleColors[role] || "hsl(var(--muted))",
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Аналитика 📊</h1>
        <p className="text-muted-foreground mt-1">Сводные данные по компании</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Средний балл" value={String(avgScore)} subtitle="По всем сотрудникам" icon={TrendingUp} />
        <MetricCard title="Готовность к роли" value={`${avgReadiness}%`} subtitle="Средняя по компании" icon={Target} />
        <MetricCard title="Оценок проведено" value={String(assessments.length)} icon={BarChart3} />
        <MetricCard title="Целей достигнуто" value={`${completedGoals}/${totalGoals}`} icon={Users} />
      </div>

      {/* Trend + Role distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Динамика оценок по месяцам</h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Line type="monotone" dataKey="avgScore" stroke="hsl(var(--primary))" strokeWidth={2} name="Средний балл" />
                <Line type="monotone" dataKey="assessments" stroke="hsl(var(--info))" strokeWidth={2} name="Кол-во оценок" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных об оценках</p>
          )}
        </div>

        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Распределение ролей</h3>
          {roleDistribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={roleDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={4}>
                    {roleDistribution.map((entry, i) => (
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
      </div>

      {/* Department comparison + Skills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Сравнение отделов</h3>
          {departmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Средний балл" />
                <Bar dataKey="avgReadiness" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} name="Готовность" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </div>

        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Средние компетенции</h3>
          {skillData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={skillData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Средний уровень" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных о компетенциях</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
