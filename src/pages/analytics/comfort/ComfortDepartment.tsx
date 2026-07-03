/**
 * Comfort Analytics — уровень отдела. Drill-down от компании.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const riskColor: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
};
const riskLabel: Record<string, string> = { low: "Комфортно", medium: "Умеренно", high: "Риск", critical: "Критично" };

export default function ComfortDepartment() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await laravel.get<any>(`/comfort/department/${id}`);
      setData(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const dept = data?.department;
  const employees = data?.employees ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Link to="/analytics/comfort" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> К компании
      </Link>

      <header className="space-y-1">
        <h1 className="text-3xl font-serif">{data?.name ?? "Отдел"}</h1>
        <p className="text-sm text-muted-foreground">Индекс комфорта и распределение риска по сотрудникам отдела.</p>
      </header>

      {dept && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Tile label="Индекс" value={dept.comfort_index} risk={dept.risk_level} />
          <Tile label="Тон общения" value={dept.tov_score} />
          <Tile label="KPI" value={dept.kpi_score} />
          <Tile label="Карьера" value={dept.career_score} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Сотрудники ({employees.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {employees.map((e: any) => (
              <Link key={e.user_id} to={`/analytics/comfort/user/${e.user_id}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/40 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={e.avatar_url ?? undefined} />
                    <AvatarFallback>{(e.full_name ?? "?").slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{e.position ?? ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground hidden md:block">
                    Тон {e.tov_score ?? "—"} · KPI {e.kpi_score ?? "—"} · Карьера {e.career_score ?? "—"}
                  </div>
                  <div className="w-12 text-right font-serif text-xl">{e.comfort_index ?? "—"}</div>
                  {e.risk_level && <Badge variant="outline" className={riskColor[e.risk_level]}>{riskLabel[e.risk_level]}</Badge>}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {employees.length === 0 && <div className="p-6 text-sm text-muted-foreground">Нет данных.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, risk }: { label: string; value: number; risk?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-serif mt-1">{value}</div>
      {risk && <Badge variant="outline" className={`mt-2 ${riskColor[risk]}`}>{riskLabel[risk]}</Badge>}
    </CardContent></Card>
  );
}
