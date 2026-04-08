import { Target, BookOpen, Award, TrendingUp, Clock, MessageSquare } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import ProgressRing from "@/components/ProgressRing";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

const radarData = [
  { skill: "Лидерство", value: 78 },
  { skill: "Технические", value: 92 },
  { skill: "Коммуникация", value: 65 },
  { skill: "Аналитика", value: 88 },
  { skill: "Управление", value: 70 },
  { skill: "Инновации", value: 75 },
];

const recentActivities = [
  { text: "Завершён модуль «Управление проектами»", time: "2 часа назад", type: "success" as const },
  { text: "Новая карьерная цель назначена", time: "Вчера", type: "info" as const },
  { text: "Оценка компетенций обновлена", time: "3 дня назад", type: "warning" as const },
  { text: "Достижение «Наставник месяца» получено", time: "Неделю назад", type: "success" as const },
];

const Dashboard = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Добро пожаловать, Алексей! 👋</h1>
        <p className="text-muted-foreground mt-1">Вот обзор вашего карьерного развития</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          title="Прогресс трека"
          value="67%"
          subtitle="5 из 8 целей"
          icon={Target}
          trend={{ value: "+12% за месяц", positive: true }}
        />
        <MetricCard
          title="Пройдено курсов"
          value="12"
          subtitle="3 в процессе"
          icon={BookOpen}
          trend={{ value: "+2 за неделю", positive: true }}
        />
        <MetricCard
          title="Достижения"
          value="8"
          subtitle="2 новых"
          icon={Award}
        />
        <MetricCard
          title="Готовность к роли"
          value="74%"
          subtitle="Senior Engineer"
          icon={TrendingUp}
          trend={{ value: "+5%", positive: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress ring + quick actions */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-6">Общий прогресс</h3>
          <div className="flex flex-col items-center">
            <ProgressRing progress={67} size={140} label="завершено" />
            <div className="mt-6 w-full space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Технические навыки</span>
                <span className="font-medium text-foreground">92%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: "92%" }} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Soft Skills</span>
                <span className="font-medium text-foreground">65%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-info h-2 rounded-full transition-all" style={{ width: "65%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Radar chart */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Профиль компетенций</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity feed */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Последняя активность</h3>
          <div className="space-y-4">
            {recentActivities.map((activity, i) => (
              <div key={i} className="flex gap-3 animate-slide-in" style={{ animationDelay: `${i * 100}ms` }}>
                <div
                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    activity.type === "success" ? "bg-success" : activity.type === "info" ? "bg-info" : "bg-warning"
                  }`}
                />
                <div>
                  <p className="text-sm text-foreground">{activity.text}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <button className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-elevated transition-shadow text-left group">
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
        <button className="bg-card rounded-xl p-6 shadow-card border border-border hover:shadow-elevated transition-shadow text-left group">
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
