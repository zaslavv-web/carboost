import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, TrendingUp, Target, Award, Eye, Loader2, UserPlus, X, Search } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { toast } from "sonner";

interface TeamMember {
  user_id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  overall_score: number | null;
  role_readiness: number | null;
  goalProgress: number;
  goalCount: number;
  completedGoals: number;
}

const ManagerDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchAdd, setSearchAdd] = useState("");

  // Get team member IDs
  const { data: teamIds = [] } = useQuery({
    queryKey: ["team_members", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("employee_id")
        .eq("manager_id", user!.id);
      if (error) throw error;
      return (data || []).map((t) => t.employee_id);
    },
    enabled: !!user,
  });

  // Get team profiles + goals + competencies
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["manager_team_data", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];

      const [profilesRes, goalsRes, compsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, position, department, overall_score, role_readiness").in("user_id", teamIds),
        supabase.from("career_goals").select("user_id, progress, status").in("user_id", teamIds),
        supabase.from("competencies").select("user_id, skill_name, skill_value").in("user_id", teamIds),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      const goalsByUser = new Map<string, { total: number; completed: number; sumProgress: number }>();
      for (const g of goalsRes.data || []) {
        const cur = goalsByUser.get(g.user_id) || { total: 0, completed: 0, sumProgress: 0 };
        cur.total++;
        cur.sumProgress += g.progress;
        if (g.status === "completed") cur.completed++;
        goalsByUser.set(g.user_id, cur);
      }

      return (profilesRes.data || []).map((p) => {
        const goals = goalsByUser.get(p.user_id) || { total: 0, completed: 0, sumProgress: 0 };
        return {
          ...p,
          goalProgress: goals.total > 0 ? Math.round(goals.sumProgress / goals.total) : 0,
          goalCount: goals.total,
          completedGoals: goals.completed,
        } as TeamMember;
      });
    },
    enabled: teamIds.length > 0,
  });

  // Aggregated competencies for radar
  const { data: teamCompetencies = [] } = useQuery({
    queryKey: ["manager_team_competencies", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];
      const { data, error } = await supabase
        .from("competencies")
        .select("skill_name, skill_value")
        .in("user_id", teamIds);
      if (error) throw error;

      const skillMap = new Map<string, { sum: number; count: number }>();
      for (const c of data || []) {
        const cur = skillMap.get(c.skill_name) || { sum: 0, count: 0 };
        cur.sum += c.skill_value;
        cur.count++;
        skillMap.set(c.skill_name, cur);
      }
      return Array.from(skillMap.entries()).map(([skill, d]) => ({
        skill,
        value: Math.round(d.sum / d.count),
      }));
    },
    enabled: teamIds.length > 0,
  });

  // All profiles for adding to team
  const { data: allProfiles = [] } = useQuery({
    queryKey: ["all_profiles_for_manager"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, position, department");
      if (error) throw error;
      return data || [];
    },
    enabled: showAddModal,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.from("team_members").insert({ manager_id: user!.id, employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["manager_team_data"] });
      queryClient.invalidateQueries({ queryKey: ["manager_team_competencies"] });
      toast.success("Сотрудник добавлен в команду");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("manager_id", user!.id).eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
      queryClient.invalidateQueries({ queryKey: ["manager_team_data"] });
      queryClient.invalidateQueries({ queryKey: ["manager_team_competencies"] });
      toast.success("Сотрудник удалён из команды");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const avgProgress = teamMembers.length > 0 ? Math.round(teamMembers.reduce((s, m) => s + m.goalProgress, 0) / teamMembers.length) : 0;
  const totalGoals = teamMembers.reduce((s, m) => s + m.goalCount, 0);
  const avgScore = teamMembers.length > 0 ? Math.round(teamMembers.reduce((s, m) => s + (m.overall_score || 0), 0) / teamMembers.length) : 0;
  const atRiskCount = teamMembers.filter((m) => m.goalProgress < 40 && m.goalCount > 0).length;

  const getStatus = (m: TeamMember) => {
    if (m.goalCount === 0) return "no_goals";
    if (m.completedGoals === m.goalCount) return "completed";
    if (m.goalProgress < 40) return "at_risk";
    return "on_track";
  };

  const statusColors: Record<string, string> = {
    on_track: "bg-success",
    at_risk: "bg-destructive",
    completed: "bg-primary",
    no_goals: "bg-muted-foreground",
  };

  const availableToAdd = allProfiles.filter(
    (p) => p.user_id !== user?.id && !teamIds.includes(p.user_id) && p.full_name.toLowerCase().includes(searchAdd.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Дашборд руководителя 📊</h1>
          <p className="text-muted-foreground mt-1">Обзор команды и прогресса развития</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <UserPlus className="w-4 h-4" /> Добавить в команду
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Сотрудников в команде" value={String(teamMembers.length)} icon={Users} />
        <MetricCard title="Средний прогресс" value={`${avgProgress}%`} subtitle="По карьерным трекам" icon={TrendingUp} />
        <MetricCard title="Целей в работе" value={String(totalGoals)} subtitle={atRiskCount > 0 ? `${atRiskCount} под угрозой` : undefined} icon={Target} />
        <MetricCard title="Средний балл" value={String(avgScore)} subtitle="Компетенции команды" icon={Award} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team members list */}
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-foreground">Моя команда</h3>
            <span className="text-xs text-muted-foreground">{teamMembers.length} сотрудников</span>
          </div>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Добавьте сотрудников в команду</p>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member, i) => {
                const status = getStatus(member);
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors animate-slide-in"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-semibold flex-shrink-0">
                      {member.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{member.full_name}</p>
                        <span className={`w-2 h-2 rounded-full ${statusColors[status]} flex-shrink-0`} />
                      </div>
                      <p className="text-xs text-muted-foreground">{member.position || "—"}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Прогресс</span>
                          <span className="font-medium text-foreground">{member.goalProgress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${statusColors[status]}`} style={{ width: `${member.goalProgress}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{member.overall_score || 0}</p>
                        <p className="text-xs text-muted-foreground">балл</p>
                      </div>
                      <button
                        onClick={() => removeMemberMutation.mutate(member.user_id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Убрать из команды"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Team competencies radar */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Компетенции команды</h3>
          {teamCompetencies.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={teamCompetencies}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
              Нет данных о компетенциях
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-muted-foreground">В графике</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter((m) => getStatus(m) === "on_track").length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Под угрозой</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter((m) => getStatus(m) === "at_risk").length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">Завершили трек</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter((m) => getStatus(m) === "completed").length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Department breakdown */}
      {teamMembers.length > 0 && (() => {
        const deptMap = new Map<string, { count: number; totalScore: number }>();
        teamMembers.forEach((m) => {
          const dept = m.department || "Без отдела";
          const cur = deptMap.get(dept) || { count: 0, totalScore: 0 };
          cur.count++;
          cur.totalScore += m.overall_score || 0;
          deptMap.set(dept, cur);
        });
        const deptData = Array.from(deptMap.entries()).map(([name, d]) => ({
          name,
          avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0,
          employees: d.count,
        }));
        return (
          <div className="bg-card rounded-xl p-6 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-4">Эффективность по отделам</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Средний балл" />
                <Bar dataKey="employees" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} name="Сотрудников" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Add member modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddModal(false)}>
          <div className="bg-card rounded-xl border border-border p-6 w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Добавить в команду</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchAdd}
                onChange={(e) => setSearchAdd(e.target.value)}
                placeholder="Поиск..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {availableToAdd.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{p.position || "—"} · {p.department || "—"}</p>
                  </div>
                  <button
                    onClick={() => addMemberMutation.mutate(p.user_id)}
                    disabled={addMemberMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {availableToAdd.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Нет доступных сотрудников</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;
