import { useState } from "react";
import { Users, TrendingUp, Shield, BarChart3, Search, UserPlus, Settings, Eye, Edit, Trash2, ChevronDown } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const allEmployees = [
  { id: 1, name: "Алексей Иванов", position: "Старший инженер", department: "Разработка", role: "employee" as const, score: 82, progress: 67, status: "active" as const },
  { id: 2, name: "Мария Петрова", position: "Инженер", department: "Разработка", role: "employee" as const, score: 85, progress: 82, status: "active" as const },
  { id: 3, name: "Дмитрий Козлов", position: "Аналитик", department: "Аналитика", role: "employee" as const, score: 72, progress: 65, status: "active" as const },
  { id: 4, name: "Елена Сидорова", position: "Разработчик", department: "Разработка", role: "employee" as const, score: 68, progress: 45, status: "at_risk" as const },
  { id: 5, name: "Андрей Волков", position: "Тестировщик", department: "QA", role: "employee" as const, score: 90, progress: 91, status: "active" as const },
  { id: 6, name: "Ольга Новикова", position: "Дизайнер", department: "Дизайн", role: "employee" as const, score: 55, progress: 30, status: "at_risk" as const },
  { id: 7, name: "Сергей Морозов", position: "Руководитель разработки", department: "Разработка", role: "manager" as const, score: 88, progress: 75, status: "active" as const },
  { id: 8, name: "Анна Кузнецова", position: "Руководитель QA", department: "QA", role: "manager" as const, score: 79, progress: 60, status: "active" as const },
];

const departmentData = [
  { name: "Разработка", employees: 4, avgScore: 78 },
  { name: "QA", employees: 2, avgScore: 84 },
  { name: "Аналитика", employees: 1, avgScore: 72 },
  { name: "Дизайн", employees: 1, avgScore: 55 },
];

const roleDistribution = [
  { name: "Сотрудники", value: 6, color: "hsl(var(--primary))" },
  { name: "Руководители", value: 2, color: "hsl(var(--info))" },
  { name: "HRD", value: 1, color: "hsl(var(--warning))" },
];

const statusBadge = {
  active: { label: "Активен", cls: "bg-success/10 text-success" },
  at_risk: { label: "Под угрозой", cls: "bg-destructive/10 text-destructive" },
};

const roleBadge = {
  employee: { label: "Сотрудник", cls: "bg-secondary text-secondary-foreground" },
  manager: { label: "Руководитель", cls: "bg-info/10 text-info" },
  hrd: { label: "HRD", cls: "bg-warning/10 text-warning" },
};

type RoleFilter = "all" | "employee" | "manager" | "hrd";

const HRDDashboard = () => {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [showRoleMenu, setShowRoleMenu] = useState<number | null>(null);

  const filtered = allEmployees.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.department.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Панель администратора HRD 🛡️</h1>
          <p className="text-muted-foreground mt-1">Управление сотрудниками, ролями и развитием</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
          <UserPlus className="w-4 h-4" /> Добавить сотрудника
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard title="Всего сотрудников" value={String(allEmployees.length)} subtitle="2 руководителя" icon={Users} trend={{ value: "+3 за квартал", positive: true }} />
        <MetricCard title="Средний балл" value="77" subtitle="По всей компании" icon={TrendingUp} trend={{ value: "+5", positive: true }} />
        <MetricCard title="Под угрозой" value="2" subtitle="Требуют внимания" icon={Shield} />
        <MetricCard title="Отделов" value="4" subtitle="8 активных треков" icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role distribution */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Распределение ролей</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={roleDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
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
        </div>

        {/* Department comparison */}
        <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Средний балл по отделам</h3>
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
                    {r === "all" ? "Все" : r === "employee" ? "Сотрудники" : r === "manager" ? "Руководители" : "HRD"}
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
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Прогресс</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Статус</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const sBadge = statusBadge[emp.status];
                const rBadge = roleBadge[emp.role];
                return (
                  <tr key={emp.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-semibold">
                          {emp.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-foreground">{emp.department}</td>
                    <td className="py-3 px-4">
                      <div className="relative">
                        <button
                          onClick={() => setShowRoleMenu(showRoleMenu === emp.id ? null : emp.id)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${rBadge.cls}`}
                        >
                          {rBadge.label} <ChevronDown className="w-3 h-3" />
                        </button>
                        {showRoleMenu === emp.id && (
                          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-elevated z-10 py-1 min-w-[140px]">
                            {(["employee", "manager", "hrd"] as const).map((r) => (
                              <button
                                key={r}
                                onClick={() => setShowRoleMenu(null)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-foreground"
                              >
                                {roleBadge[r].label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-foreground">{emp.score}</span>
                      <span className="text-muted-foreground">/100</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${emp.progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground">{emp.progress}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sBadge.cls}`}>{sBadge.label}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Просмотр паспорта">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Редактировать трек">
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-sm text-muted-foreground border-t border-border">
          Показано {filtered.length} из {allEmployees.length} сотрудников
        </div>
      </div>
    </div>
  );
};

export default HRDDashboard;
