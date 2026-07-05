/**
 * Comfort Analytics — карточка сотрудника: радар суб-скорингов, таймлайн сигналов, рекомендации.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, LineChart,
  Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ChevronLeft, ArrowUpRight } from "lucide-react";
import { tooltipProps } from "@/lib/chartTooltip";
import { MetricLabel } from "@/components/metrics/MetricLabel";
import type { MetricKey } from "@/lib/metricsCatalog";


const riskColor: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
};
const riskLabel: Record<string, string> = { low: "Комфортно", medium: "Умеренно", high: "Риск", critical: "Критично" };

const factorLabel: Record<string, string> = {
  "tov.chat_silence": "Мало сообщений в чатах",
  "tov.harsh_tone": "Резкий тон в переписке",
  "tov.no_recognition": "Нет признаний за 60 дней",
  "kpi.overdue_tasks": "Просроченные задачи",
  "kpi.no_1on1": "Давно не было 1:1",
  "kpi.absences": "Много отсутствий",
  "career.stalled": "Застой в карьерном треке",
  "career.no_track": "Нет карьерного трека",
};

export default function ComfortEmployee() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await laravel.get<any>(`/comfort/user/${id}`);
      setData(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const s = data?.score;
  const user = data?.user;
  const signals = data?.signals ?? [];
  const trend = data?.trend ?? [];
  const radar = s ? [
    { k: "Тон общения", v: s.tov_score },
    { k: "KPI", v: s.kpi_score },
    { k: "Карьера", v: s.career_score },
  ] : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Link to="/analytics/comfort" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> К дашборду
      </Link>

      <header className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={user?.avatar_url ?? undefined} />
          <AvatarFallback>{(user?.full_name ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-3xl font-serif">{user?.full_name ?? "Сотрудник"}</h1>
          <p className="text-sm text-muted-foreground">{user?.position ?? ""} · {user?.department ?? ""}</p>
        </div>
        {s && <Badge variant="outline" className={`text-sm ${riskColor[s.risk_level]}`}>{riskLabel[s.risk_level]}</Badge>}
        <Link to={`/users/${id}`}><Button variant="outline"><ArrowUpRight className="h-4 w-4 mr-1" /> Профиль</Button></Link>
      </header>

      {s ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tile label="Индекс" value={s.comfort_index} />
            <Tile label="Тон общения" value={s.tov_score} />
            <Tile label="KPI" value={s.kpi_score} />
            <Tile label="Карьера" value={s.career_score} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Профиль</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radar}>
                    <PolarGrid stroke="#8884" />
                    <PolarAngleAxis dataKey="k" tick={{ fontSize: 12 }} />
                    <Radar dataKey="v" stroke="#D5A52A" fill="#D5A52A" fillOpacity={0.4} />
                    <Tooltip {...tooltipProps("bar")} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Тренд индекса</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="period_start" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip {...tooltipProps("bar")} />
                    <Line type="monotone" dataKey="comfort_index" stroke="#D5A52A" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Факторы риска</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(s.factors ?? []).length === 0 && <p className="text-sm text-muted-foreground">Всё в порядке.</p>}
                {(s.factors ?? []).map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border bg-card/50">
                    <span className="text-sm">{factorLabel[f.type] ?? f.type}</span>
                    {f.value !== undefined && <span className="text-xs text-muted-foreground">{String(f.value)}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Рекомендации</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(s.recommendations ?? []).length === 0 && <p className="text-sm text-muted-foreground">Действия не требуются.</p>}
                {(s.recommendations ?? []).map((r: string, i: number) => (
                  <div key={i} className="text-sm p-2 rounded border-l-2 border-primary bg-primary/5">{r}</div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Таймлайн сигналов</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-96 overflow-y-auto">
                {signals.length === 0 && <div className="p-4 text-sm text-muted-foreground">Событий нет.</div>}
                {signals.map((sig: any) => (
                  <div key={sig.id} className="flex items-center justify-between p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${sig.polarity === "pos" ? "bg-emerald-500" : sig.polarity === "neg" ? "bg-red-500" : "bg-muted-foreground"}`} />
                      <span>{factorLabel[sig.signal_type] ?? sig.signal_type}</span>
                      <span className="text-xs text-muted-foreground">· {sig.source}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(sig.occurred_at).toLocaleDateString("ru-RU")} · {sig.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Индекс ещё не рассчитан.</CardContent></Card>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-serif mt-1">{value}</div>
    </CardContent></Card>
  );
}
