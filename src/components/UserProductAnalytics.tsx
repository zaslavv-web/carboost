/**
 * Продуктовая аналитика конкретного пользователя.
 * Использует существующий эндпоинт GET /analytics/user-timeline.
 * Доступ — только superadmin (проверка на бэке: abort_if(!$isSuper, 403)).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { laravel } from "@/integrations/laravel/client";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";

type Ev = { id: string; event_type: string; event_name: string; route?: string | null; occurred_at: string };
type Session = { id: string; started_at: string; ended_at: string | null; errors_count: number };

const UserProductAnalytics = ({ userId }: { userId: string }) => {
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["user_product_analytics", userId, days],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ events: Ev[]; sessions: Session[] }>(
        `/analytics/user-timeline?user_id=${userId}`,
      );
      if (error) throw new Error(error.message);
      return data!;
    },
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const events = (data.events || []).filter((e) => new Date(e.occurred_at).getTime() >= cutoff);
    const sessions = (data.sessions || []).filter((s) => new Date(s.started_at).getTime() >= cutoff);
    const errored = sessions.filter((s) => s.errors_count > 0).length;
    const avgSec = sessions
      .filter((s) => s.ended_at)
      .map((s) => (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 1000)
      .reduce((a, b, _, arr) => a + b / arr.length, 0);

    const byDay: Record<string, { events: number }> = {};
    events.forEach((e) => {
      const d = format(new Date(e.occurred_at), "yyyy-MM-dd");
      byDay[d] = byDay[d] || { events: 0 };
      byDay[d].events++;
    });
    const dau = Object.entries(byDay).sort().map(([d, v]) => ({ d, events: v.events }));

    const routeCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    events.forEach((e) => {
      if (e.event_type === "page_view" && e.route) {
        routeCounts[e.route] = (routeCounts[e.route] || 0) + 1;
      }
      if (e.event_type === "action") {
        actionCounts[e.event_name] = (actionCounts[e.event_name] || 0) + 1;
      }
    });
    const topRoutes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      events: events.length, sessions: sessions.length, errored, avgSec: Math.round(avgSec),
      dau, topRoutes, topActions, latest: events.slice(0, 20),
    };
  }, [data, days]);

  if (isLoading) return <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-12" />;
  if (error) return <div className="text-destructive">{(error as Error).message}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {d} дней
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="События" value={stats.events} />
        <Metric label="Сессии" value={stats.sessions} />
        <Metric label="С ошибками" value={stats.errored} />
        <Metric label="Сред. сессия" value={`${stats.avgSec}s`} />
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Активность по дням</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={stats.dau}>
            <defs>
              <linearGradient id="evColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="d" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip {...tooltipProps("bar")} />
            <Area type="monotone" dataKey="events" stroke="hsl(var(--primary))" fill="url(#evColor)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopList title="Топ маршрутов" rows={stats.topRoutes} />
        <TopList title="Топ действий" rows={stats.topActions} />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <h3 className="text-sm font-medium text-foreground p-4 border-b border-border">Последние события</h3>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr><th className="text-left px-3 py-2">Время</th><th className="text-left px-3 py-2">Тип</th><th className="text-left px-3 py-2">Событие</th><th className="text-left px-3 py-2">Маршрут</th></tr>
          </thead>
          <tbody>
            {stats.latest.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{format(new Date(e.occurred_at), "dd.MM HH:mm")}</td>
                <td className="px-3 py-2">{e.event_type}</td>
                <td className="px-3 py-2 text-foreground">{e.event_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.route || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="bg-card rounded-xl border border-border p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
  </div>
);

const TopList = ({ title, rows }: { title: string; rows: [string, number][] }) => (
  <div className="bg-card rounded-xl border border-border p-4">
    <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-xs text-muted-foreground">Нет данных</p>
    ) : (
      <ul className="space-y-2">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between text-sm">
            <span className="text-foreground truncate mr-2">{k}</span>
            <span className="text-muted-foreground tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default UserProductAnalytics;
