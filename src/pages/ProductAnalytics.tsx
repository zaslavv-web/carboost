import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { useTranslation } from "react-i18next";
import { Loader2, Activity, Route as RouteIcon, AlertTriangle, Users, TrendingUp, Clock } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend,
} from "recharts";
import MetricCard from "@/components/MetricCard";

type Tab = "overview" | "paths" | "features" | "problems";

interface OverviewData {
  total_events: number;
  total_sessions: number;
  errored_sessions: number;
  avg_session_seconds: number;
  dau: { d: string; users: number; events: number }[];
  top_routes: { route: string; count: number }[];
  top_actions: { event_name: string; count: number }[];
}
interface EventsData { events: { event_name: string; event_type: string; count: number; users: number }[]; }
interface PathsData { transitions: { from: string; to: string; count: number }[]; }
interface ProblemsData {
  js_errors: { event_name: string; component: string; route: string; count: number; users: number; last_seen: string }[];
  api_errors: { event_name: string; status_code: number; route: string; count: number; users: number; last_seen: string }[];
  drop_routes: { exit_route: string; count: number }[];
}

const ProductAnalytics = () => {
  const { t } = useTranslation("admin");
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState(14);
  const [groupBy, setGroupBy] = useState<"role" | "user">("role");
  const [userId, setUserId] = useState("");

  const qs = `?days=${days}`;

  const { data: overview, isLoading: ovL } = useQuery({
    queryKey: ["pa_overview", days],
    queryFn: async () => (await laravel.get<OverviewData>(`/analytics/overview${qs}`)).data,
    enabled: tab === "overview",
  });
  const { data: events, isLoading: evL } = useQuery({
    queryKey: ["pa_events", days],
    queryFn: async () => (await laravel.get<EventsData>(`/analytics/events${qs}`)).data,
    enabled: tab === "features",
  });
  const { data: paths, isLoading: pL } = useQuery({
    queryKey: ["pa_paths", days, groupBy, userId],
    queryFn: async () =>
      (await laravel.get<PathsData>(
        `/analytics/paths${qs}${groupBy === "user" && userId ? `&user_id=${encodeURIComponent(userId)}` : ""}`,
      )).data,
    enabled: tab === "paths",
  });
  const { data: problems, isLoading: prL } = useQuery({
    queryKey: ["pa_problems", days],
    queryFn: async () => (await laravel.get<ProblemsData>(`/analytics/problems${qs}`)).data,
    enabled: tab === "problems",
  });

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: t("productAnalytics.tabs.overview"), icon: TrendingUp },
    { id: "paths", label: t("productAnalytics.tabs.paths"), icon: RouteIcon },
    { id: "features", label: t("productAnalytics.tabs.features"), icon: Activity },
    { id: "problems", label: t("productAnalytics.tabs.problems"), icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("productAnalytics.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("productAnalytics.subtitle")}</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
        >
          {[1, 7, 14, 30, 90].map((d) => (
            <option key={d} value={d}>{t("productAnalytics.period", { count: d })}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            data-track={`product_analytics.tab.${tb.id}`}
            className={`inline-flex items-center gap-2 px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
              tab === tb.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tb.icon className="w-4 h-4" />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        ovL || !overview ? <Loader /> : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title={t("productAnalytics.m.sessions")} value={String(overview.total_sessions)} icon={Users} />
              <MetricCard title={t("productAnalytics.m.events")} value={String(overview.total_events)} icon={Activity} />
              <MetricCard
                title={t("productAnalytics.m.erroredSessions")}
                value={`${overview.errored_sessions} / ${overview.total_sessions}`}
                icon={AlertTriangle}
              />
              <MetricCard
                title={t("productAnalytics.m.avgSession")}
                value={`${Math.round(overview.avg_session_seconds / 60)} ${t("productAnalytics.minShort")}`}
                icon={Clock}
              />
            </div>

            <Card title={t("productAnalytics.charts.dau")}>
              {overview.dau.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={overview.dau}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="d" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="users" stroke="hsl(var(--primary))" name={t("productAnalytics.m.users")} />
                    <Line type="monotone" dataKey="events" stroke="hsl(var(--info))" name={t("productAnalytics.m.events")} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title={t("productAnalytics.charts.topRoutes")}>
                <SimpleTable
                  rows={overview.top_routes}
                  cols={[
                    { k: "route", label: t("productAnalytics.cols.route") },
                    { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                  ]}
                />
              </Card>
              <Card title={t("productAnalytics.charts.topActions")}>
                <SimpleTable
                  rows={overview.top_actions}
                  cols={[
                    { k: "event_name", label: t("productAnalytics.cols.action") },
                    { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                  ]}
                />
              </Card>
            </div>
          </div>
        )
      )}

      {tab === "paths" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
            >
              <option value="role">{t("productAnalytics.paths.byGroup")}</option>
              <option value="user">{t("productAnalytics.paths.byUser")}</option>
            </select>
            {groupBy === "user" && (
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={t("productAnalytics.paths.userIdPlaceholder")}
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm flex-1 min-w-[260px]"
              />
            )}
          </div>
          {pL || !paths ? <Loader /> : paths.transitions.length === 0 ? <Empty /> : (
            <Card title={t("productAnalytics.paths.title")}>
              <SimpleTable
                rows={paths.transitions}
                cols={[
                  { k: "from", label: t("productAnalytics.paths.from") },
                  { k: "to", label: t("productAnalytics.paths.to") },
                  { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {tab === "features" && (
        evL || !events ? <Loader /> : events.events.length === 0 ? <Empty /> : (
          <Card title={t("productAnalytics.features.title")}>
            <ResponsiveContainer width="100%" height={Math.min(40 + events.events.length * 22, 600)}>
              <BarChart data={events.events.slice(0, 20)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="event_name" type="category" width={180} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" name={t("productAnalytics.cols.count")} />
                <Bar dataKey="users" fill="hsl(var(--info))" name={t("productAnalytics.m.users")} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4">
              <SimpleTable
                rows={events.events}
                cols={[
                  { k: "event_name", label: t("productAnalytics.cols.event") },
                  { k: "event_type", label: t("productAnalytics.cols.type") },
                  { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                  { k: "users", label: t("productAnalytics.m.users"), align: "right" },
                ]}
              />
            </div>
          </Card>
        )
      )}

      {tab === "problems" && (
        prL || !problems ? <Loader /> : (
          <div className="space-y-6">
            <Card title={t("productAnalytics.problems.dropRoutes")}>
              {problems.drop_routes.length === 0 ? <Empty /> :
                <SimpleTable
                  rows={problems.drop_routes}
                  cols={[
                    { k: "exit_route", label: t("productAnalytics.cols.route") },
                    { k: "count", label: t("productAnalytics.problems.exitedSessions"), align: "right" },
                  ]}
                />}
            </Card>
            <Card title={t("productAnalytics.problems.jsErrors")}>
              {problems.js_errors.length === 0 ? <Empty /> :
                <SimpleTable
                  rows={problems.js_errors}
                  cols={[
                    { k: "event_name", label: t("productAnalytics.cols.event") },
                    { k: "route", label: t("productAnalytics.cols.route") },
                    { k: "component", label: t("productAnalytics.cols.component") },
                    { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                    { k: "users", label: t("productAnalytics.m.users"), align: "right" },
                  ]}
                />}
            </Card>
            <Card title={t("productAnalytics.problems.apiErrors")}>
              {problems.api_errors.length === 0 ? <Empty /> :
                <SimpleTable
                  rows={problems.api_errors}
                  cols={[
                    { k: "route", label: t("productAnalytics.cols.route") },
                    { k: "status_code", label: t("productAnalytics.cols.status"), align: "right" },
                    { k: "count", label: t("productAnalytics.cols.count"), align: "right" },
                    { k: "users", label: t("productAnalytics.m.users"), align: "right" },
                  ]}
                />}
            </Card>
          </div>
        )
      )}
    </div>
  );
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const Loader = () => (
  <div className="flex items-center justify-center h-40">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

const Empty = () => {
  const { t } = useTranslation("admin");
  return <p className="text-sm text-muted-foreground text-center py-6">{t("productAnalytics.empty")}</p>;
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card rounded-xl p-5 shadow-card border border-border">
    <h3 className="font-semibold text-foreground mb-4">{title}</h3>
    {children}
  </div>
);

const SimpleTable = ({
  rows,
  cols,
}: {
  rows: any[];
  cols: { k: string; label: string; align?: "left" | "right" }[];
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
          {cols.map((c) => (
            <th key={c.k} className={`py-2 px-2 ${c.align === "right" ? "text-right" : "text-left"}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50 hover:bg-secondary/40">
            {cols.map((c) => (
              <td key={c.k} className={`py-2 px-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                {String(r[c.k] ?? "—")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ProductAnalytics;
