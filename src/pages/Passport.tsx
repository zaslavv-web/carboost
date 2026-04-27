import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Award, Calendar, Edit, Loader2, Plus, X } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";

const Passport = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const [showAddAchievement, setShowAddAchievement] = useState(false);
  const [newAchievement, setNewAchievement] = useState({ title: "", description: "" });

  const { data: competencies = [] } = useQuery({
    queryKey: ["competencies", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("competencies").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("achievements").select("*").eq("user_id", user!.id).order("achievement_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["assessments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: latestQuestionnaire } = useQuery({
    queryKey: ["latest_employee_questionnaire", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_questionnaires" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });

  const addAchievementMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("achievements").insert({
        user_id: user!.id,
        title: newAchievement.title,
        description: newAchievement.description,
        achievement_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
      setShowAddAchievement(false);
      setNewAchievement({ title: "", description: "" });
      toast.success("Достижение добавлено");
    },
    onError: () => toast.error("Ошибка при добавлении"),
  });

  const radarData = competencies.map((c) => ({ skill: c.skill_name, value: c.skill_value }));
  const initials = profile?.full_name ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Цифровой паспорт</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">Полный профиль компетенций и достижений</p>
      </div>

      {/* Profile header */}
      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="h-20 md:h-24 gradient-hero" />
        <div className="px-4 md:px-6 pb-5 md:pb-6 -mt-8 md:-mt-10">
          <div className="flex items-end gap-4 md:gap-5">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground text-xl md:text-2xl font-bold border-4 border-card flex-shrink-0">
              {initials}
            </div>
            <div className="pb-1 min-w-0">
              <h2 className="text-base md:text-xl font-bold text-foreground truncate">{profile?.full_name || "—"}</h2>
              <p className="text-muted-foreground text-xs md:text-sm truncate">
                {profile?.position || "Должность не указана"} · {profile?.department || "Отдел не указан"}
                {profile?.hire_date && ` · с ${format(new Date(profile.hire_date), "yyyy")}`}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-xl md:text-2xl font-bold text-foreground">{profile?.overall_score || 0}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Общий скор</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-xl md:text-2xl font-bold text-foreground">{profile?.role_readiness || 0}%</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Готовность</p>
            </div>
            <div className="text-center">
              <p className="text-xl md:text-2xl font-bold text-foreground">{achievements.length}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">Достижений</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl p-6 shadow-card border border-border lg:col-span-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Анкета первичного заполнения</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {latestQuestionnaire
                  ? `Последняя версия: ${latestQuestionnaire.status === "draft" ? "черновик" : "отправлена"}`
                  : "Заполните анкету, чтобы сформировать стартовый профиль компетенций"}
              </p>
            </div>
            <Link to="/employee-questionnaire" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {latestQuestionnaire?.status === "draft" ? "Продолжить" : "Открыть анкету"}
            </Link>
          </div>
        </div>

        {/* Radar */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <h3 className="font-semibold text-foreground mb-4">Навыки и компетенции</h3>
          {radarData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="space-y-3 mt-4">
                {competencies.slice(0, 4).map((c) => (
                  <div key={c.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{c.skill_name}</span>
                      <span className="font-medium text-foreground">{c.skill_value}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${c.skill_value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              Пройдите AI-оценку для формирования профиля компетенций
            </div>
          )}
        </div>

        {/* Achievements */}
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Достижения и проекты</h3>
            <button onClick={() => setShowAddAchievement(true)} className="text-sm text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Добавить
            </button>
          </div>

          {showAddAchievement && (
            <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-accent/30 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">Новое достижение</h4>
                <button onClick={() => setShowAddAchievement(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <input
                type="text"
                placeholder="Название достижения"
                value={newAchievement.title}
                onChange={(e) => setNewAchievement({ ...newAchievement, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
              <input
                type="text"
                placeholder="Описание (необязательно)"
                value={newAchievement.description}
                onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-input bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
              <button
                onClick={() => addAchievementMutation.mutate()}
                disabled={!newAchievement.title || addAchievementMutation.isPending}
                className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50"
              >
                {addAchievementMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
              </button>
            </div>
          )}

          <div className="space-y-4">
            {achievements.length > 0 ? achievements.map((a) => (
              <div key={a.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-primary">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                  {a.achievement_date && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" /> {format(new Date(a.achievement_date), "MMMM yyyy")}
                    </p>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-8">Нет достижений. Добавьте первое!</p>
            )}
          </div>
        </div>
      </div>

      {/* Assessment history */}
      <div className="bg-card rounded-xl p-6 shadow-card border border-border">
        <h3 className="font-semibold text-foreground mb-4">История оценок</h3>
        {assessments.length > 0 ? (
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
                {assessments.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-4 text-foreground">{format(new Date(row.created_at), "dd.MM.yyyy")}</td>
                    <td className="py-3 px-4 text-foreground">{row.assessment_type === "ai" ? "AI-оценка" : row.assessment_type}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-foreground">{row.score || 0}</span>
                      <span className="text-muted-foreground">/100</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={row.change_value?.startsWith("+") ? "text-success font-medium" : "text-muted-foreground"}>
                        {row.change_value || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Нет истории оценок. Пройдите AI-оценку!</p>
        )}
      </div>
    </div>
  );
};

export default Passport;
