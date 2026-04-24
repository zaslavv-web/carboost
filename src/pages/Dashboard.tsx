import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useNavigate } from "react-router-dom";
import {
  Target,
  Award,
  TrendingUp,
  Clock,
  MessageSquare,
  Sparkles,
  Heart,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import CurrencyWidget from "@/components/CurrencyWidget";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  PolarRadiusAxis,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const Dashboard = () => {
  const effectiveUserId = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  const navigate = useNavigate();

  const { data: competencies = [] } = useQuery({
    queryKey: ["competencies", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competencies")
        .select("skill_name, skill_value")
        .eq("user_id", effectiveUserId!);
      if (error) throw error;
      return (data || []).map((c) => ({ skill: c.skill_name, value: c.skill_value }));
    },
    enabled: !!effectiveUserId,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["career_goals", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("career_goals")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveUserId,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("user_id", effectiveUserId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveUserId,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["recent_notifications", effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", effectiveUserId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveUserId,
  });

  const completedGoals = goals.filter((g) => g.status === "completed").length;
  const totalGoals = goals.length;
  const overallProgress =
    totalGoals > 0
      ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / totalGoals)
      : 0;
  const avgCompetency =
    competencies.length > 0
      ? Math.round(competencies.reduce((s, c) => s + c.value, 0) / competencies.length)
      : 0;
  const firstName = profile?.full_name?.split(" ")[0] || "пользователь";
  const topSkills = [...competencies].sort((a, b) => b.value - a.value).slice(0, 4);

  // AI tips — simple heuristics for now (real impl would call edge function)
  const aiTips = (() => {
    const tips: { title: string; cta: string; href: string; icon: any }[] = [];
    if (competencies.length === 0) {
      tips.push({
        title: "Начните с AI-оценки, чтобы открыть профиль компетенций",
        cta: "Пройти оценку",
        href: "/assessment",
        icon: MessageSquare,
      });
    }
    if (totalGoals === 0) {
      tips.push({
        title: "У вас нет активных целей. Постройте карьерный трек.",
        cta: "Открыть трек",
        href: "/career-track",
        icon: Target,
      });
    }
    if (avgCompetency > 0 && avgCompetency < 50) {
      tips.push({
        title: "Сфокусируйтесь на двух самых слабых навыках в этом месяце",
        cta: "Посмотреть план",
        href: "/career-track",
        icon: Sparkles,
      });
    }
    if (tips.length === 0) {
      tips.push({
        title: "Отличный темп! Поблагодарите коллегу, который помог вам в этом месяце.",
        cta: "Открыть ленту",
        href: "/recognition",
        icon: Heart,
      });
    }
    return tips.slice(0, 3);
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero / Digital passport */}
      <div className="relative overflow-hidden rounded-2xl gradient-hero p-6 md:p-8 shadow-elevated">
        <div className="absolute inset-0 gradient-glow opacity-70 pointer-events-none" />
        <div className="relative grid md:grid-cols-[auto,1fr,auto] gap-6 items-center">
          <div className="relative">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl gradient-primary flex items-center justify-center text-primary-foreground text-2xl md:text-3xl font-bold shadow-glow">
              {firstName[0]?.toUpperCase()}
            </div>
            <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-md bg-success text-success-foreground text-xs font-semibold shadow-card">
              Lv. {Math.max(1, Math.floor(overallProgress / 10))}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary/80 font-medium">
              Цифровой паспорт
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-1">
              Привет, {firstName} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {profile?.position || "Должность не указана"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topSkills.slice(0, 5).map((s) => (
                <Badge key={s.skill} variant="secondary" className="bg-primary/15 text-primary border-primary/30">
                  {s.skill} · {s.value}
                </Badge>
              ))}
              {topSkills.length === 0 && (
                <Badge variant="secondary" className="text-muted-foreground">
                  Профиль навыков пока пустой
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Карьерный уровень</div>
            <div className="text-4xl md:text-5xl font-bold gradient-text mt-1">{overallProgress}%</div>
            <div className="mt-3 w-48 ml-auto h-2 rounded-full bg-background/40 overflow-hidden">
              <div
                className="h-full gradient-primary transition-all duration-700"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="glass p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Target className="w-4 h-4 text-primary" /> Прогресс трека
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{overallProgress}%</div>
          <div className="text-xs text-muted-foreground mt-1">
            {completedGoals} из {totalGoals} целей
          </div>
        </Card>
        <Card className="glass p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-info" /> Компетенции
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{competencies.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Средний балл: {avgCompetency}</div>
        </Card>
        <Card className="glass p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Award className="w-4 h-4 text-warning" /> Достижения
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{achievements.length}</div>
        </Card>
        <Card className="glass p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Sparkles className="w-4 h-4 text-success" /> Готовность к роли
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">{profile?.role_readiness ?? 0}%</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">{profile?.position || "—"}</div>
        </Card>
      </div>

      <CurrencyWidget />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Career timeline */}
        <Card className="glass p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-foreground">Карьерный трек</h3>
            <button
              onClick={() => navigate("/career-track")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Подробнее <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {goals.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
              Карьерный трек ещё не построен.
              <div className="mt-3">
                <Button onClick={() => navigate("/career-track")} variant="outline" size="sm">
                  Открыть трек
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />
              <ul className="space-y-4">
                {goals.slice(0, 5).map((g) => {
                  const done = g.status === "completed";
                  return (
                    <li key={g.id} className="relative">
                      <span className="absolute -left-6 top-0.5">
                        {done ? (
                          <CheckCircle2 className="w-5 h-5 text-success" />
                        ) : (
                          <Circle className="w-5 h-5 text-muted-foreground" />
                        )}
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium text-foreground">{g.title}</span>
                          <Badge
                            variant="secondary"
                            className={
                              done
                                ? "bg-success/15 text-success border-success/30"
                                : "bg-primary/15 text-primary border-primary/30"
                            }
                          >
                            {g.progress || 0}%
                          </Badge>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              done ? "bg-success" : "gradient-primary"
                            }`}
                            style={{ width: `${g.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>

        {/* AI sidebar */}
        <div className="space-y-4">
          <Card className="glass p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">AI-рекомендации</h3>
            </div>
            <ul className="space-y-3">
              {aiTips.map((t, i) => {
                const Icon = t.icon;
                return (
                  <li key={i} className="rounded-lg p-3 bg-background/40 border border-border/50">
                    <div className="flex gap-3">
                      <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-snug">{t.title}</p>
                        <button
                          onClick={() => navigate(t.href)}
                          className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                        >
                          {t.cta} <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="glass p-5">
            <h3 className="font-semibold text-foreground mb-3">Профиль навыков</h3>
            {competencies.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={competencies}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="skill"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <PolarRadiusAxis tick={false} axisLine={false} />
                  <Radar
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Пройдите AI-оценку для формирования радара навыков
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass p-6 lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4">Последняя активность</h3>
          {notifications.length > 0 ? (
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li key={n.id} className="flex gap-3 animate-slide-in">
                  <span
                    className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      n.notification_type === "success"
                        ? "bg-success"
                        : n.notification_type === "warning"
                        ? "bg-warning"
                        : n.notification_type === "achievement"
                        ? "bg-primary"
                        : "bg-info"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ru })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Нет уведомлений</p>
          )}
        </Card>

        <div className="grid gap-4">
          <button
            onClick={() => navigate("/assessment")}
            className="glass rounded-xl p-5 hover-lift text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  AI-оценка
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Сильные стороны и зоны роста</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => navigate("/recognition")}
            className="glass rounded-xl p-5 hover-lift text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 flex items-center justify-center">
                <Heart className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground group-hover:text-rose-500 transition-colors">
                  Поблагодарить коллегу
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">Признание + игровая валюта</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
