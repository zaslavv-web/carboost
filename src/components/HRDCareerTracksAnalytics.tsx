import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Loader2, Route, Users, TrendingUp } from "lucide-react";

interface Step {
  order?: number;
  title?: string;
  duration_months?: number;
}

const HRDCareerTracksAnalytics = () => {
  const { data: profile } = useUserProfile();
  const companyId = profile?.company_id;

  const { data, isLoading } = useQuery({
    queryKey: ["hrd_track_analytics", companyId],
    queryFn: async () => {
      const [tplRes, asgRes] = await Promise.all([
        supabase.from("career_track_templates").select("id, title, steps, estimated_months"),
        supabase.from("employee_career_assignments").select("template_id, current_step, status, user_id"),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (asgRes.error) throw asgRes.error;
      const templates = tplRes.data || [];
      const assignments = asgRes.data || [];

      return templates
        .map((t) => {
          const tAsg = assignments.filter((a) => a.template_id === t.id);
          if (tAsg.length === 0) return null;
          const steps = (t.steps as unknown as Step[]) || [];
          const totalSteps = Math.max(steps.length, 1);
          const avgStep =
            tAsg.reduce((s, a) => s + (a.current_step || 0), 0) / tAsg.length;
          const avgProgress = Math.round((avgStep / totalSteps) * 100);
          const completed = tAsg.filter((a) => a.status === "completed").length;
          const failed = tAsg.filter((a) => a.status === "failed").length;
          const stepDistribution = Array.from({ length: totalSteps }, (_, i) => ({
            stepLabel: steps[i]?.title?.slice(0, 18) || `Этап ${i + 1}`,
            count: tAsg.filter((a) => (a.current_step || 0) === i && a.status !== "completed").length,
          }));
          return {
            id: t.id,
            title: t.title,
            assigned: tAsg.length,
            completed,
            failed,
            avgStep: Math.round(avgStep * 10) / 10,
            totalSteps,
            avgProgress,
            stepDistribution,
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        title: string;
        assigned: number;
        completed: number;
        failed: number;
        avgStep: number;
        totalSteps: number;
        avgProgress: number;
        stepDistribution: { stepLabel: string; count: number }[];
      }>;
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <Route className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Нет данных</h3>
        <p className="text-sm text-muted-foreground">Пока нет назначенных карьерных треков с активными участниками.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Route className="w-4 h-4" /> Активных треков
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">{data.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Users className="w-4 h-4" /> Всего участников
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {data.reduce((s, d) => s + d.assigned, 0)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <TrendingUp className="w-4 h-4" /> Средний прогресс
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {Math.round(
              data.reduce((s, d) => s + d.avgProgress * d.assigned, 0) /
                Math.max(1, data.reduce((s, d) => s + d.assigned, 0)),
            )}
            %
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Сводка по трекам</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Трек</th>
                <th className="py-2 pr-4 font-medium text-center">Участников</th>
                <th className="py-2 pr-4 font-medium text-center">Завершили</th>
                <th className="py-2 pr-4 font-medium text-center">Срыв</th>
                <th className="py-2 pr-4 font-medium text-center">Ср. этап</th>
                <th className="py-2 pr-4 font-medium text-center">Ср. прогресс</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-foreground">{d.title}</td>
                  <td className="py-2 pr-4 text-center text-foreground">{d.assigned}</td>
                  <td className="py-2 pr-4 text-center text-success">{d.completed}</td>
                  <td className="py-2 pr-4 text-center text-destructive">{d.failed}</td>
                  <td className="py-2 pr-4 text-center text-foreground">
                    {d.avgStep}/{d.totalSteps}
                  </td>
                  <td className="py-2 pr-4 text-center">
                    <span
                      className={`font-semibold ${
                        d.avgProgress >= 70
                          ? "text-success"
                          : d.avgProgress >= 40
                          ? "text-warning"
                          : "text-destructive"
                      }`}
                    >
                      {d.avgProgress}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.map((d) => (
        <div key={d.id} className="bg-card border border-border rounded-xl p-5">
          <h4 className="font-semibold text-foreground mb-3">{d.title} — распределение по этапам</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.stepDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="stepLabel" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {d.stepDistribution.map((_, i) => (
                  <Cell key={i} fill="hsl(var(--primary))" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
};

export default HRDCareerTracksAnalytics;
