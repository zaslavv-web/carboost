import { Award, Briefcase, GraduationCap, Star, Calendar, Edit } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

const competencies = [
  { skill: "Лидерство", value: 78, max: 100 },
  { skill: "Технические", value: 92, max: 100 },
  { skill: "Коммуникация", value: 65, max: 100 },
  { skill: "Аналитика", value: 88, max: 100 },
  { skill: "Управление", value: 70, max: 100 },
  { skill: "Инновации", value: 75, max: 100 },
  { skill: "Стратегия", value: 60, max: 100 },
  { skill: "Менторство", value: 82, max: 100 },
];

const achievements = [
  { title: "Лучший сотрудник Q3 2025", date: "Сентябрь 2025", icon: Star, color: "text-warning" },
  { title: "Сертификация AWS Solutions Architect", date: "Июль 2025", icon: GraduationCap, color: "text-info" },
  { title: "Наставник месяца", date: "Май 2025", icon: Award, color: "text-primary" },
  { title: "Успешный запуск проекта «Альфа»", date: "Март 2025", icon: Briefcase, color: "text-success" },
];

const assessmentHistory = [
  { date: "15.01.2026", type: "AI-оценка", score: 82, change: "+5" },
  { date: "10.10.2025", type: "360° Обратная связь", score: 77, change: "+3" },
  { date: "05.07.2025", type: "AI-оценка", score: 74, change: "+8" },
  { date: "20.04.2025", type: "Ежеквартальная оценка", score: 66, change: "—" },
];

const Passport = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Цифровой паспорт</h1>
          <p className="text-muted-foreground text-sm mt-1">Полный профиль компетенций и достижений</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
          <Edit className="w-4 h-4" /> Редактировать
        </button>
      </div>

      {/* Profile header */}
      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="h-24 gradient-hero" />
        <div className="px-6 pb-6 -mt-10">
          <div className="flex items-end gap-5">
            <div className="w-20 h-20 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold border-4 border-card">
              АИ
            </div>
            <div className="pb-1">
              <h2 className="text-xl font-bold text-foreground">Алексей Иванов</h2>
              <p className="text-muted-foreground text-sm">Старший инженер · Отдел разработки · 3 года в компании</p>
            </div>
          </div>
          <div className="mt-4 flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">82</p>
              <p className="text-xs text-muted-foreground">Общий скор</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">74%</p>
              <p className="text-xs text-muted-foreground">Готовность к роли</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">8</p>
              <p className="text-xs text-muted-foreground">Достижений</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Навыки и компетенции</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={competencies}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          {/* Skill bars */}
          <div className="space-y-3 mt-4">
            {competencies.slice(0, 4).map((c) => (
              <div key={c.skill}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{c.skill}</span>
                  <span className="font-medium text-foreground">{c.value}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${c.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Достижения и проекты</h3>
            <button className="text-sm text-primary hover:underline">+ Добавить</button>
          </div>
          <div className="space-y-4">
            {achievements.map((a, i) => (
              <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors animate-slide-in" style={{ animationDelay: `${i * 80}ms` }}>
                <div className={`w-10 h-10 rounded-lg bg-accent flex items-center justify-center ${a.color}`}>
                  <a.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> {a.date}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assessment history */}
      <div className="bg-card rounded-xl p-6 shadow-card border border-border">
        <h3 className="font-semibold text-foreground mb-4">История оценок</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Дата</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Тип</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Балл</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {assessmentHistory.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="py-3 px-4 text-foreground">{row.date}</td>
                  <td className="py-3 px-4 text-foreground">{row.type}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-foreground">{row.score}</span>
                    <span className="text-muted-foreground">/100</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={row.change.startsWith("+") ? "text-success font-medium" : "text-muted-foreground"}>
                      {row.change}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Passport;
