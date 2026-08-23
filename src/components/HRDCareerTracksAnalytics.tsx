import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { tooltipProps } from "@/lib/chartTooltip";
import { laravel } from "@/integrations/laravel/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Loader2, Route, Users, TrendingUp, AlertTriangle, Gauge } from "lucide-react";

interface FunnelPoint {
  step: number;
  label: string;
  reached: number;
  share: number;
}

interface TrackRow {
  id: string;
  title: string;
  assigned: number;
  completed: number;
  completion_rate: number;
  total_steps: number;
  avg_progress: number;
  funnel: FunnelPoint[];
}

interface HardStep {
  template_id: string;
  track_title: string;
  step_order: number;
  step_title: string;
  submissions: number;
  rejected: number;
  rejection_rate: number;
  avg_attempts: number;
  stuck_now: number;
  difficulty: number;
}

interface DeptRow {
  department: string;
  employees: number;
  avg_progress: number;
  completion_rate: number;
  rejection_rate: number;
  difficulty: number;
}

interface PaceRow {
  user_id: string;
  full_name: string;
  department: string;
  track_title: string;
  steps_done: number;
  total_steps: number;
  months: number;
  pace: number;
  median_pace: number;
  delta_percent: number;
  status: string;
}

interface AnalyticsPayload {
  tracks: TrackRow[];
  hard_steps: HardStep[];
  departments: DeptRow[];
  pace: { fast: PaceRow[]; slow: PaceRow[]; median: number };
}

const HRDCareerTracksAnalytics = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["hrd_track_analytics_v2"],
    queryFn: async () => {
      const { data, error } = await laravel.get<AnalyticsPayload>("/analytics/career-tracks");
      if (error) throw new Error(error.message);
      return data as AnalyticsPayload;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const tracks = data?.tracks ?? [];
  const hardSteps = data?.hard_steps ?? [];
  const departments = data?.departments ?? [];
  const fast = data?.pace.fast ?? [];
  const slow = data?.pace.slow ?? [];

  if (tracks.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <Route className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Нет данных по трекам</h3>
        <p className="text-sm text-muted-foreground">
          Назначьте сотрудникам карьерные треки, чтобы увидеть аналитику.
        </p>
      </div>
    );
  }

  const totalAssigned = tracks.reduce((s, t) => s + t.assigned, 0);
  const totalCompleted = tracks.reduce((s, t) => s + t.completed, 0);
  const avgProgress = Math.round(
    tracks.reduce((s, t) => s + t.avg_progress * t.assigned, 0) / Math.max(1, totalAssigned),
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Route, label: "Активных треков", value: String(tracks.length), to: "/career-tracks?tab=templates" },
          { icon: Users, label: "Участников", value: String(totalAssigned), to: "/career-tracks?tab=assignments" },
          { icon: TrendingUp, label: "Средний прогресс", value: `${avgProgress}%`, to: "/career-tracks?tab=assignments" },
          {
            icon: Gauge,
            label: "Завершили переход",
            value: `${totalCompleted} (${Math.round((totalCompleted / Math.max(1, totalAssigned)) * 100)}%)`,
            to: "/career-tracks?tab=assignments",
          },
        ].map((kpi) => (
          <button
            key={kpi.label}
            onClick={() => navigate(kpi.to)}
            className="bg-card border border-border rounded-xl p-4 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <kpi.icon className="w-4 h-4" /> {kpi.label}
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{kpi.value}</p>
          </button>
        ))}
      </div>

      {/* Воронка переходов по каждому треку */}
      {tracks.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/career-tracks?template=${t.id}&tab=assignments`)}
          onKeyDown={(e) => e.key === "Enter" && navigate(`/career-tracks?template=${t.id}&tab=assignments`)}
          className="bg-card border border-border rounded-xl p-5 cursor-pointer transition-colors hover:border-primary/50"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h4 className="font-semibold text-foreground">Воронка перехода: {t.title}</h4>
            <span className="text-xs text-muted-foreground">
              {t.assigned} участников · завершили {t.completion_rate}% · средний прогресс {t.avg_progress}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={t.funnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                interval={0}
                height={50}
                angle={-15}
                textAnchor="end"
              />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip {...tooltipProps("bar")} />
              <Bar dataKey="reached" name="Дошли" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(row: FunnelPoint) => navigate(`/career-tracks?template=${t.id}&step=${row.step}&tab=assignments`)}>
                {t.funnel.map((f, i) => (
                  <Cell key={i} fill={i === t.funnel.length - 1 ? "hsl(var(--success))" : "hsl(var(--primary))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}

      {/* Самые трудные этапы */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" /> Наиболее трудные этапы
        </h4>
        {hardSteps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Отправок по этапам пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Трек / этап</th>
                  <th className="py-2 pr-4 font-medium text-center">Отправок</th>
                  <th className="py-2 pr-4 font-medium text-center">Отклонено</th>
                  <th className="py-2 pr-4 font-medium text-center">Попыток в среднем</th>
                  <th className="py-2 pr-4 font-medium text-center">Застряли сейчас</th>
                  <th className="py-2 pr-4 font-medium text-center">Сложность</th>
                </tr>
              </thead>
              <tbody>
                {hardSteps.map((h) => (
                  <tr
                    key={`${h.template_id}-${h.step_order}`}
                    onClick={() => navigate(`/career-tracks?template=${h.template_id}&step=${h.step_order}&tab=assignments`)}
                    className="border-b border-border/50 cursor-pointer hover:bg-secondary/40"
                  >
                    <td className="py-2 pr-4">
                      <span className="font-medium text-foreground">{h.step_title}</span>
                      <span className="block text-xs text-muted-foreground">{h.track_title}</span>
                    </td>
                    <td className="py-2 pr-4 text-center text-foreground">{h.submissions}</td>
                    <td className="py-2 pr-4 text-center text-destructive">
                      {h.rejected} ({h.rejection_rate}%)
                    </td>
                    <td className="py-2 pr-4 text-center text-foreground">{h.avg_attempts}</td>
                    <td className="py-2 pr-4 text-center text-foreground">{h.stuck_now}</td>
                    <td className="py-2 pr-4 text-center">
                      <span
                        className={`font-semibold ${
                          h.difficulty >= 60 ? "text-destructive" : h.difficulty >= 30 ? "text-warning" : "text-success"
                        }`}
                      >
                        {h.difficulty}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Отделы */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="font-semibold text-foreground mb-3">Отделы с самыми трудными треками</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Отдел</th>
                <th className="py-2 pr-4 font-medium text-center">Сотрудников</th>
                <th className="py-2 pr-4 font-medium text-center">Средний прогресс</th>
                <th className="py-2 pr-4 font-medium text-center">Завершили</th>
                <th className="py-2 pr-4 font-medium text-center">Отклонений</th>
                <th className="py-2 pr-4 font-medium text-center">Сложность</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr
                  key={d.department}
                  onClick={() => navigate(`/employee-map?department=${encodeURIComponent(d.department)}`)}
                  className="border-b border-border/50 cursor-pointer hover:bg-secondary/40"
                >
                  <td className="py-2 pr-4 font-medium text-foreground">{d.department}</td>
                  <td className="py-2 pr-4 text-center text-foreground">{d.employees}</td>
                  <td className="py-2 pr-4 text-center text-foreground">{d.avg_progress}%</td>
                  <td className="py-2 pr-4 text-center text-success">{d.completion_rate}%</td>
                  <td className="py-2 pr-4 text-center text-destructive">{d.rejection_rate}%</td>
                  <td className="py-2 pr-4 text-center font-semibold text-foreground">{d.difficulty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Темп сотрудников */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { title: "Идут быстрее медианы", rows: fast, positive: true },
          { title: "Отстают от медианы", rows: slow, positive: false },
        ].map((block) => (
          <div key={block.title} className="bg-card border border-border rounded-xl p-5">
            <h4 className="font-semibold text-foreground mb-3">{block.title}</h4>
            {block.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Недостаточно данных.</p>
            ) : (
              <div className="space-y-2">
                {block.rows.map((r) => (
                  <button
                    key={`${r.user_id}-${r.track_title}`}
                    onClick={() => navigate(`/career-tracks/employee/${r.user_id}`)}
                    className="w-full text-left flex items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-secondary/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.department} · {r.track_title} · {r.steps_done}/{r.total_steps} за {r.months} мес.
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        r.delta_percent >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {r.delta_percent > 0 ? "+" : ""}
                      {r.delta_percent}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default HRDCareerTracksAnalytics;
