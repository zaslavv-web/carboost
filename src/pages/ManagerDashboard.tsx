import { Users, TrendingUp, Target, Award, BarChart3, Eye, UserCheck } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

const teamMembers = [
  { name: "Мария Петрова", position: "Инженер", progress: 82, status: "on_track" as const, score: 85 },
  { name: "Дмитрий Козлов", position: "Аналитик", progress: 65, status: "on_track" as const, score: 72 },
  { name: "Елена Сидорова", position: "Разработчик", progress: 45, status: "at_risk" as const, score: 68 },
  { name: "Андрей Волков", position: "Тестировщик", progress: 91, status: "completed" as const, score: 90 },
  { name: "Ольга Новикова", position: "Дизайнер", progress: 30, status: "at_risk" as const, score: 55 },
];

const teamCompetencies = [
  { skill: "Лидерство", value: 72 },
  { skill: "Технические", value: 85 },
  { skill: "Коммуникация", value: 68 },
  { skill: "Аналитика", value: 78 },
  { skill: "Управление", value: 65 },
  { skill: "Инновации", value: 70 },
];

const progressData = [
  { month: "Янв", progress: 45 },
  { month: "Фев", progress: 52 },
  { month: "Мар", progress: 58 },
  { month: "Апр", progress: 67 },
  { month: "Май", progress: 72 },
  { month: "Июн", progress: 78 },
];

const statusColors = {
  on_track: "bg-success",
  at_risk: "bg-destructive",
  completed: "bg-primary",
};

const statusLabels = {
  on_track: "В графике",
  at_risk: "Под угрозой",
  completed: "Завершён",
};

const ManagerDashboard = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Дашборд руководителя 📊</h1>
        <p className="text-muted-foreground mt-1">Обзор команды и прогресса развития</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Сотрудников в команде" value="5" subtitle="1 новый за месяц" icon={Users} trend={{ value: "+1", positive: true }} />
        <MetricCard title="Средний прогресс" value="63%" subtitle="По карьерным трекам" icon={TrendingUp} trend={{ value: "+8%", positive: true }} />
        <MetricCard title="Целей в работе" value="12" subtitle="3 под угрозой" icon={Target} />
        <MetricCard title="Средний балл" value="74" subtitle="Компетенции команды" icon={Award} trend={{ value: "+3", positive: true }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team members list */}
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-foreground">Моя команда</h3>
            <span className="text-xs text-muted-foreground">{teamMembers.length} сотрудников</span>
          </div>
          <div className="space-y-3">
            {teamMembers.map((member, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer animate-slide-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-semibold flex-shrink-0">
                  {member.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                    <span className={`w-2 h-2 rounded-full ${statusColors[member.status]} flex-shrink-0`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{member.position}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="w-24">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Прогресс</span>
                      <span className="font-medium text-foreground">{member.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${statusColors[member.status]}`} style={{ width: `${member.progress}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{member.score}</p>
                    <p className="text-xs text-muted-foreground">балл</p>
                  </div>
                  <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team competencies radar */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Компетенции команды</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={teamCompetencies}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-muted-foreground">В графике</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter(m => m.status === "on_track").length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Под угрозой</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter(m => m.status === "at_risk").length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">Завершили трек</span>
              </div>
              <span className="font-medium text-foreground">{teamMembers.filter(m => m.status === "completed").length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress chart */}
      <div className="bg-card rounded-xl p-6 shadow-card border border-border">
        <h3 className="font-semibold text-foreground mb-4">Динамика прогресса команды</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={progressData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Bar dataKey="progress" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Средний прогресс, %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ManagerDashboard;
