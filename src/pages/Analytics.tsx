import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { laravelDb } from "@/integrations/laravel/db";
import { BarChart3, TrendingUp, Users, Target, Loader2, ImageDown, FileSpreadsheet } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";
import { toPng } from "html-to-image";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const useAnalyticsData = () =>
  useQuery({
    queryKey: ["analytics_data"],
    queryFn: async () => {
      const [profilesRes, rolesRes, assessmentsRes, competenciesRes, goalsRes] = await Promise.all([
        laravelDb.from("profiles").select("user_id, full_name, department, overall_score, role_readiness"),
        laravelDb.from("user_roles").select("user_id, role"),
        laravelDb.from("assessments").select("user_id, score, assessment_type, created_at"),
        laravelDb.from("competencies").select("user_id, skill_name, skill_value"),
        laravelDb.from("career_goals").select("user_id, status, progress"),
      ]);
      return {
        profiles: profilesRes.data || [],
        roles: rolesRes.data || [],
        assessments: assessmentsRes.data || [],
        competencies: competenciesRes.data || [],
        goals: goalsRes.data || [],
      };
    },
  });

const downloadFile = (data: Blob | string, filename: string) => {
  const url = typeof data === "string" ? data : URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof data !== "string") setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const todayStamp = () => new Date().toISOString().slice(0, 10);

const Analytics = () => {
  const { t } = useTranslation("manager");
  const { data, isLoading } = useAnalyticsData();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const { profiles, roles, assessments, competencies, goals } = data;

  const avgScore = profiles.length > 0
    ? Math.round(profiles.reduce((s, p) => s + (p.overall_score || 0), 0) / profiles.length)
    : 0;

  const avgReadiness = profiles.length > 0
    ? Math.round(profiles.reduce((s, p) => s + (p.role_readiness || 0), 0) / profiles.length)
    : 0;

  const completedGoals = goals.filter((g) => g.status === "completed").length;
  const totalGoals = goals.length;

  const deptMap = new Map<string, { count: number; totalScore: number; totalReadiness: number }>();
  profiles.forEach((p) => {
    const dept = p.department || t("analytics.noDept");
    const cur = deptMap.get(dept) || { count: 0, totalScore: 0, totalReadiness: 0 };
    cur.count++;
    cur.totalScore += p.overall_score || 0;
    cur.totalReadiness += p.role_readiness || 0;
    deptMap.set(dept, cur);
  });
  const departmentData = Array.from(deptMap.entries()).map(([name, d]) => ({
    name,
    avgScore: d.count > 0 ? Math.round(d.totalScore / d.count) : 0,
    avgReadiness: d.count > 0 ? Math.round(d.totalReadiness / d.count) : 0,
    employees: d.count,
  }));

  const skillMap = new Map<string, { total: number; count: number }>();
  competencies.forEach((c) => {
    const cur = skillMap.get(c.skill_name) || { total: 0, count: 0 };
    cur.total += c.skill_value;
    cur.count++;
    skillMap.set(c.skill_name, cur);
  });
  const skillData = Array.from(skillMap.entries()).map(([name, d]) => ({
    name,
    value: Math.round(d.total / d.count),
  }));

  const monthMap = new Map<string, { total: number; count: number }>();
  assessments.forEach((a) => {
    const month = a.created_at.slice(0, 7);
    const cur = monthMap.get(month) || { total: 0, count: 0 };
    cur.total += a.score || 0;
    cur.count++;
    monthMap.set(month, cur);
  });
  const trendData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      avgScore: d.count > 0 ? Math.round(d.total / d.count) : 0,
      assessments: d.count,
    }));

  const roleCounts: Record<string, number> = {};
  roles.forEach((r) => {
    roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
  });
  const roleColors: Record<string, string> = {
    employee: "hsl(var(--primary))",
    manager: "hsl(var(--info))",
    hrd: "hsl(var(--warning))",
    superadmin: "hsl(var(--destructive))",
  };
  const roleDistribution = Object.entries(roleCounts).map(([role, value]) => ({
    name: t(`analytics.roles.${role}`, { defaultValue: role }),
    value,
    color: roleColors[role] || "hsl(var(--muted))",
  }));

  const handleExportPng = async () => {
    if (!dashboardRef.current) return;
    setExportingPng(true);
    try {
      const bgColor = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(dashboardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: bgColor,
        filter: (node) => {
          if (node instanceof HTMLElement && node.dataset.exportExclude === "true") return false;
          return true;
        },
      });
      downloadFile(dataUrl, `analytics-dashboard-${todayStamp()}.png`);
      toast.success(t("analytics.toast.pngSaved"));
    } catch (err) {
      console.error("PNG export failed", err);
      toast.error(t("analytics.toast.pngError"));
    } finally {
      setExportingPng(false);
    }
  };

  const handleExportXlsx = () => {
    setExportingXlsx(true);
    try {
      const wb = XLSX.utils.book_new();

      const kMetric = t("analytics.metrics.avgScore");
      const summaryRows = [
        { [kMetric]: t("analytics.metrics.avgScore"), value: avgScore },
        { [kMetric]: t("analytics.metrics.roleReadiness") + " (%)", value: avgReadiness },
        { [kMetric]: t("analytics.metrics.assessmentsDone"), value: assessments.length },
        { [kMetric]: t("analytics.metrics.goalsCompleted"), value: completedGoals },
        { [kMetric]: "Total goals", value: totalGoals },
        { [kMetric]: "Employees", value: profiles.length },
        { [kMetric]: "Export date", value: todayStamp() },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 32 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      const wsTrend = XLSX.utils.json_to_sheet(
        trendData.map((r) => ({ Month: r.month, AvgScore: r.avgScore, Assessments: r.assessments }))
      );
      XLSX.utils.book_append_sheet(wb, wsTrend, "Trend");

      const wsRoles = XLSX.utils.json_to_sheet(
        roleDistribution.map((r) => ({ Role: r.name, Count: r.value }))
      );
      XLSX.utils.book_append_sheet(wb, wsRoles, "Roles");

      const wsDept = XLSX.utils.json_to_sheet(
        departmentData.map((d) => ({
          Department: d.name,
          Employees: d.employees,
          AvgScore: d.avgScore,
          Readiness: d.avgReadiness,
        }))
      );
      XLSX.utils.book_append_sheet(wb, wsDept, "Departments");

      const wsSkills = XLSX.utils.json_to_sheet(
        skillData.map((s) => ({ Competency: s.name, AvgLevel: s.value }))
      );
      XLSX.utils.book_append_sheet(wb, wsSkills, "Competencies");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadFile(blob, `analytics-${todayStamp()}.xlsx`);
      toast.success(t("analytics.toast.xlsxSaved"));
    } catch (err) {
      console.error("XLSX export failed", err);
      toast.error(t("analytics.toast.xlsxError"));
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4" data-export-exclude="true">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("analytics.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportPng}
            disabled={exportingPng}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-secondary text-sm font-medium transition-colors disabled:opacity-60"
          >
            {exportingPng ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
            {t("analytics.exportPng")}
          </button>
          <button
            onClick={handleExportXlsx}
            disabled={exportingXlsx}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium transition-opacity disabled:opacity-60"
          >
            {exportingXlsx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {t("analytics.exportXlsx")}
          </button>
        </div>
      </div>

      <div ref={dashboardRef} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard title={t("analytics.metrics.avgScore")} value={String(avgScore)} subtitle={t("analytics.metrics.allEmployees")} icon={TrendingUp} />
          <MetricCard title={t("analytics.metrics.roleReadiness")} value={`${avgReadiness}%`} subtitle={t("analytics.metrics.avgPerCompany")} icon={Target} />
          <MetricCard title={t("analytics.metrics.assessmentsDone")} value={String(assessments.length)} icon={BarChart3} />
          <MetricCard title={t("analytics.metrics.goalsCompleted")} value={`${completedGoals}/${totalGoals}`} icon={Users} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-4">{t("analytics.charts.trendTitle")}</h3>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip {...tooltipProps("bar")} />
                  <Legend />
                  <Line type="monotone" dataKey="avgScore" stroke="hsl(var(--primary))" strokeWidth={2} name={t("analytics.charts.avgScoreLine")} />
                  <Line type="monotone" dataKey="assessments" stroke="hsl(var(--info))" strokeWidth={2} name={t("analytics.charts.assessmentsLine")} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.charts.noAssessments")}</p>
            )}
          </div>

          <div className="bg-card rounded-xl p-6 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-4">{t("analytics.charts.roleDistTitle")}</h3>
            {roleDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={roleDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={4}>
                      {roleDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipProps("bar")} />
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
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.charts.noData")}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl p-6 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-4">{t("analytics.charts.deptCompTitle")}</h3>
            {departmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip {...tooltipProps("bar")} />
                  <Legend />
                  <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={t("analytics.charts.avgScoreBar")} />
                  <Bar dataKey="avgReadiness" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} name={t("analytics.charts.readinessBar")} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.charts.noData")}</p>
            )}
          </div>

          <div className="bg-card rounded-xl p-6 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-4">{t("analytics.charts.skillsTitle")}</h3>
            {skillData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={skillData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} width={120} />
                  <Tooltip {...tooltipProps("bar")} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name={t("analytics.charts.avgLevelBar")} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("analytics.charts.noSkills")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
