import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useNavigate } from "react-router-dom";
import { Target, Award, TrendingUp, Clock, MessageSquare, Loader2 } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import ProgressRing from "@/components/ProgressRing";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const Dashboard = () => {
  const { user } = useAuth();
  const effectiveUserId = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  const navigate = useNavigate();

  const { data: competencies = [] } = useQuery({
    queryKey: ["competencies", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competencies")
        .select("skill_name, skill_value")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((c) => ({ skill: c.skill_name, value: c.skill_value }));
    },
    enabled: !!user,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["career_goals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("career_goals")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["recent_notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const completedGoals = goals.filter((g) => g.status === "completed").length;
  const totalGoals = goals.length;
  const overallProgress = totalGoals > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / totalGoals) : 0;
  const avgCompetency = competencies.length > 0 ? Math.round(competencies.reduce((s, c) => s + c.value, 0) / competencies.length) : 0;
  const firstName = profile?.full_name?.split(" ")[0] || "пользователь";

  const topSkills = [...competencies].sort((a, b) => b.value - a.value).slice(0, 2);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Добро пожаловать, {firstName}! 👋</h1>
        <p className="text-muted-foreground mt-1">Вот обзор вашего карьерного развития</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Прогресс трека"
          value={`${overallProgress}%`}
          subtitle={`${completedGoals} из ${totalGoals} целей`}
          icon={Target}
        />
        <MetricCard
          title="Компетенции"
          value={String(competencies.length)}
          subtitle={`Средний балл: ${avgCompetency}`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Достижения"
          value={String(achievements.length)}
          icon={Award}
        />
        <MetricCard
          title="Готовность к роли"
          value={`${profile?.role_readiness || 0}%`}
          subtitle={profile?.position || "—"}
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress ring */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-6">Общий прогресс</h3>
          <div className="flex flex-col items-center">
            <ProgressRing progress={overallProgress} size={140} label="завершено" />
            <div className="mt-6 w-full space-y-3">
              {topSkills.map((s) => (
                <div key={s.skill}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.skill}</span>
                    <span className="font-medium text-foreground">{s.value}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${s.value}%` }} />
                  </div>
                </div>
              ))}
              {topSkills.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Компетенции пока не добавлены</p>
              )}
            </div>
          </div>
        </div>

        {/* Radar chart */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Профиль компетенций</h3>
          {competencies.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={competencies}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[240px] text-sm text-muted-foreground">
              Пройдите AI-оценку для формирования профиля
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Последняя активность</h3>
          <div className="space-y-4">
            {notifications.length > 0 ? notifications.map((n) => (
              <div key={n.id} className="flex gap-3 animate-slide-in">
                <div
                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    n.notification_type === "success" ? "bg-success" :
                    n.notification_type === "warning" ? "bg-warning" :
                    n.notification_type === "achievement" ? "bg-primary" : "bg-info"
                  }`}
                />
                <div>
                  <p className="text-sm text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Нет уведомлений</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <button onClick={() => navigate("/assessment")} className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-elevated transition-shadow text-left group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Пройти AI-оценку</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Узнайте свои сильные стороны и зоны роста</p>
            </div>
          </div>
        </button>
        <button onClick={() => navigate("/career-track")} className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-elevated transition-shadow text-left group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
              <Target className="w-6 h-6 text-info" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-info transition-colors">Обновить карьерный трек</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Отметьте выполненные задачи и цели</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
