import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Check, Clock, ChevronDown, ChevronRight, Target, Loader2, Plus, X, Route, Award, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; color: string; textColor: string }> = {
  completed: { label: "Завершено", color: "bg-success", textColor: "text-success" },
  in_progress: { label: "В процессе", color: "bg-info", textColor: "text-info" },
  at_risk: { label: "Под угрозой", color: "bg-destructive", textColor: "text-destructive" },
};

interface Step { order: number; title: string; description: string; duration_months: number }

const CareerTrack = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromAssessment = searchParams.get("from") === "assessment";
  const [showAssessmentBanner, setShowAssessmentBanner] = useState(fromAssessment);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", description: "", deadline: "" });
  const [tab, setTab] = useState<"goals" | "tracks" | "rewards">("tracks");

  useEffect(() => {
    if (fromAssessment) {
      // remove the query flag without reloading
      const t = setTimeout(() => {
        searchParams.delete("from");
        setSearchParams(searchParams, { replace: true });
      }, 200);
      return () => clearTimeout(t);
    }
  }, [fromAssessment, searchParams, setSearchParams]);

  // Career goals
  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ["career_goals_full", user?.id],
    queryFn: async () => {
      const { data: goalsData, error: goalsErr } = await supabase
        .from("career_goals").select("*").eq("user_id", user!.id).order("created_at", { ascending: true });
      if (goalsErr) throw goalsErr;
      const goalIds = (goalsData || []).map(g => g.id);
      if (!goalIds.length) return [];
      const { data: items, error: itemsErr } = await supabase
        .from("goal_checklist_items").select("*").in("goal_id", goalIds).order("created_at", { ascending: true });
      if (itemsErr) throw itemsErr;
      return (goalsData || []).map(g => ({ ...g, checklist: (items || []).filter(i => i.goal_id === g.id) }));
    },
    enabled: !!user,
  });

  // Assigned career tracks
  const { data: assignments = [], isLoading: assignLoading } = useQuery({
    queryKey: ["my_career_assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_career_assignments").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["career_track_templates_for_employee"],
    queryFn: async () => {
      const ids = assignments.map(a => a.template_id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("career_track_templates").select("*").in("id", ids);
      if (error) throw error;
      return data || [];
    },
    enabled: assignments.length > 0,
  });

  const { data: levelActions = [] } = useQuery({
    queryKey: ["career_level_actions_for_employee"],
    queryFn: async () => {
      const ids = assignments.map(a => a.template_id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("career_level_actions").select("*").in("template_id", ids).order("action_order");
      if (error) throw error;
      return data || [];
    },
    enabled: assignments.length > 0,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_for_track"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("id, title, department");
      if (error) throw error;
      return data || [];
    },
  });

  // My rewards
  const { data: myRewards = [] } = useQuery({
    queryKey: ["my_rewards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_rewards").select("*").eq("user_id", user!.id).order("awarded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: rewardTypes = [] } = useQuery({
    queryKey: ["reward_types_for_employee"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gamification_reward_types").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const posMap = Object.fromEntries(positions.map(p => [p.id, p]));
  const templateMap = Object.fromEntries(templates.map(t => [t.id, t]));
  const rewardTypeMap = Object.fromEntries(rewardTypes.map(r => [r.id, r]));
  const totalPoints = myRewards.reduce((s, r) => s + (rewardTypeMap[r.reward_type_id]?.points || 0), 0);

  // Goal mutations
  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, isDone }: { itemId: string; isDone: boolean }) => {
      const { error } = await supabase.from("goal_checklist_items").update({ is_done: isDone }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["career_goals_full"] }),
  });

  const updateGoalProgressMutation = useMutation({
    mutationFn: async ({ goalId, progress, status }: { goalId: string; progress: number; status: string }) => {
      const { error } = await supabase.from("career_goals").update({ progress, status }).eq("id", goalId);
      if (error) throw error;
    },
  });

  const addGoalMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("career_goals").insert({
        user_id: user!.id, title: newGoal.title, description: newGoal.description || null, deadline: newGoal.deadline || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_goals_full"] });
      setShowAddGoal(false); setNewGoal({ title: "", description: "", deadline: "" });
      toast.success("Цель добавлена");
    },
  });

  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const addChecklistItemMutation = useMutation({
    mutationFn: async ({ goalId, text }: { goalId: string; text: string }) => {
      const { error } = await supabase.from("goal_checklist_items").insert({ goal_id: goalId, text });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["career_goals_full"] }),
  });

  const handleToggle = async (goalId: string, itemId: string, currentDone: boolean) => {
    const newDone = !currentDone;
    await toggleItemMutation.mutateAsync({ itemId, isDone: newDone });
    const goal = goals.find(g => g.id === goalId);
    if (goal) {
      const updated = goal.checklist.map((c: any) => c.id === itemId ? { ...c, is_done: newDone } : c);
      const total = updated.length;
      const done = updated.filter((c: any) => c.is_done).length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      const status = progress === 100 ? "completed" : "in_progress";
      await updateGoalProgressMutation.mutateAsync({ goalId, progress, status });
      queryClient.invalidateQueries({ queryKey: ["career_goals_full"] });
    }
  };

  const isLoading = goalsLoading || assignLoading;
  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Мой карьерный трек</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">Карьерный путь, цели и награды</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-4">
        <div className="bg-card rounded-xl p-3 md:p-5 shadow-card border border-border">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
              <Route className="w-4 h-4 md:w-5 md:h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-foreground leading-tight">{assignments.length}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">Треков</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-3 md:p-5 shadow-card border border-border">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 md:w-5 md:h-5 text-success" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-foreground leading-tight">{goals.filter(g => g.status === "completed").length}/{goals.length}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">Целей</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-3 md:p-5 shadow-card border border-border">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
              <Award className="w-4 h-4 md:w-5 md:h-5 text-warning" />
            </div>
            <div>
              <p className="text-lg md:text-2xl font-bold text-foreground leading-tight">{totalPoints}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight">Очков</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
        {(["tracks", "goals", "rewards"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {t === "tracks" ? "Карьерный путь" : t === "goals" ? "Мои цели" : "Награды"}
          </button>
        ))}
      </div>

      {/* Tracks tab */}
      {tab === "tracks" && (
        <div className="space-y-4">
          {assignments.length === 0 && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Route className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Нет назначенных карьерных треков</h3>
              <p className="text-sm text-muted-foreground">Ваш HR-менеджер назначит вам карьерный путь</p>
            </div>
          )}
          {assignments.map(a => {
            const t = templateMap[a.template_id];
            if (!t) return null;
            const fromPos = t.from_position_id ? posMap[t.from_position_id] : null;
            const toPos = t.to_position_id ? posMap[t.to_position_id] : null;
            const steps = (t.steps as unknown as Step[]) || [];
            const tActions = levelActions.filter(la => la.template_id === t.id);
            return (
              <div key={a.id} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center">
                      <Route className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {fromPos && <span>{fromPos.title}</span>}
                        {fromPos && toPos && <ArrowRight className="w-4 h-4" />}
                        {toPos && <span className="text-primary font-medium">{toPos.title}</span>}
                        {t.estimated_months && <span className="ml-2">· ~{t.estimated_months} мес.</span>}
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full ${a.status === "completed" ? "bg-success/20 text-success" : "bg-info/20 text-info"}`}>
                      {a.status === "completed" ? "Завершён" : "Активен"}
                    </span>
                  </div>

                  {t.description && <p className="text-sm text-muted-foreground mb-4">{t.description}</p>}

                  {/* Motivation */}
                  {(t.motivation_text || a.personal_motivation) && (
                    <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <h4 className="text-sm font-medium text-primary">Мотивация</h4>
                      </div>
                      <p className="text-sm text-foreground">{a.personal_motivation || t.motivation_text}</p>
                    </div>
                  )}

                  {/* Steps timeline */}
                  {steps.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-foreground mb-3">Этапы карьерного пути</h4>
                      <div className="relative">
                        {steps.map((s, i) => {
                          const isCompleted = i < a.current_step;
                          const isCurrent = i === a.current_step;
                          return (
                            <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
                              <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                  isCompleted ? "bg-success text-success-foreground" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                }`}>
                                  {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                                </div>
                                {i < steps.length - 1 && <div className={`w-0.5 h-6 mt-1 ${isCompleted ? "bg-success" : "bg-border"}`} />}
                              </div>
                              <div className={`flex-1 pb-2 ${isCurrent ? "" : ""}`}>
                                <p className={`text-sm font-medium ${isCompleted ? "text-muted-foreground line-through" : isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                                  {s.title}
                                </p>
                                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3" />{s.duration_months} мес.
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Required actions */}
                  {tActions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Что нужно для перехода на следующий уровень</h4>
                      <div className="space-y-1.5">
                        {tActions.map(act => (
                          <div key={act.id} className="flex items-center gap-2.5 p-2.5 bg-secondary/30 rounded-lg">
                            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${act.is_required ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-sm text-foreground flex-1">{act.action_text}</span>
                            {act.is_required && <span className="text-xs text-primary">обязательно</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Goals tab */}
      {tab === "goals" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddGoal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
              <Plus className="w-4 h-4" /> Новая цель
            </button>
          </div>

          {showAddGoal && (
            <div className="bg-card rounded-xl p-6 shadow-card border border-primary/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Новая карьерная цель</h3>
                <button onClick={() => setShowAddGoal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <input type="text" placeholder="Название цели" value={newGoal.title}
                onChange={e => setNewGoal({ ...newGoal, title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
              <input type="text" placeholder="Описание (необязательно)" value={newGoal.description}
                onChange={e => setNewGoal({ ...newGoal, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
              <input type="date" value={newGoal.deadline}
                onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
              <button onClick={() => addGoalMutation.mutate()} disabled={!newGoal.title || addGoalMutation.isPending}
                className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
                {addGoalMutation.isPending ? "Сохранение..." : "Создать цель"}
              </button>
            </div>
          )}

          {goals.length === 0 && !showAddGoal && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Нет карьерных целей</h3>
              <button onClick={() => setShowAddGoal(true)} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">Создать цель</button>
            </div>
          )}

          {goals.map(goal => {
            const config = statusConfig[goal.status as keyof typeof statusConfig] || statusConfig.in_progress;
            const isExpanded = expandedGoal === goal.id;
            return (
              <div key={goal.id} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
                <button onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                  className="w-full p-5 flex items-center gap-4 text-left hover:bg-secondary/30 transition-colors">
                  <div className={`w-3 h-3 rounded-full ${config.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold text-foreground ${goal.status === "completed" ? "line-through opacity-60" : ""}`}>{goal.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${config.textColor} bg-accent`}>{config.label}</span>
                    </div>
                    {goal.description && <p className="text-sm text-muted-foreground mt-0.5">{goal.description}</p>}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{goal.progress}%</p>
                      {goal.deadline && <p className="text-xs text-muted-foreground">до {format(new Date(goal.deadline), "dd.MM.yyyy")}</p>}
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border/50">
                    <div className="w-full bg-muted rounded-full h-1.5 mt-4 mb-4">
                      <div className={`h-1.5 rounded-full transition-all ${config.color}`} style={{ width: `${goal.progress}%` }} />
                    </div>
                    <div className="space-y-2">
                      {goal.checklist.map((item: any) => (
                        <label key={item.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer group">
                          <button onClick={e => { e.preventDefault(); handleToggle(goal.id, item.id, item.is_done); }}
                            disabled={toggleItemMutation.isPending}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              item.is_done ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                            }`}>
                            {item.is_done && <Check className="w-3 h-3 text-primary-foreground" />}
                          </button>
                          <span className={`text-sm flex-1 ${item.is_done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.text}</span>
                          {item.deadline && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {format(new Date(item.deadline), "dd.MM.yyyy")}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input type="text" placeholder="Новая задача..." value={newItemText[goal.id] || ""}
                        onChange={e => setNewItemText({ ...newItemText, [goal.id]: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newItemText[goal.id]?.trim()) {
                            addChecklistItemMutation.mutate({ goalId: goal.id, text: newItemText[goal.id].trim() });
                            setNewItemText({ ...newItemText, [goal.id]: "" });
                          }
                        }}
                        className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground" />
                      <button onClick={() => {
                        if (newItemText[goal.id]?.trim()) {
                          addChecklistItemMutation.mutate({ goalId: goal.id, text: newItemText[goal.id].trim() });
                          setNewItemText({ ...newItemText, [goal.id]: "" });
                        }
                      }} disabled={!newItemText[goal.id]?.trim()}
                        className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-50">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rewards tab */}
      {tab === "rewards" && (
        <div className="space-y-4">
          {totalPoints > 0 && (
            <div className="bg-card rounded-xl p-6 shadow-card border border-border">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-warning/20 flex items-center justify-center">
                  <Award className="w-7 h-7 text-warning" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{totalPoints} очков</p>
                  <p className="text-sm text-muted-foreground">{myRewards.length} наград получено</p>
                </div>
              </div>
            </div>
          )}

          {myRewards.length === 0 && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Пока нет наград</h3>
              <p className="text-sm text-muted-foreground">Выполняйте задачи и продвигайтесь по карьерному пути!</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myRewards.map(r => {
              const rt = rewardTypeMap[r.reward_type_id];
              const iconEmoji = rt?.icon === "star" ? "⭐" : rt?.icon === "medal" ? "🎖️" : rt?.icon === "rocket" ? "🚀" : rt?.icon === "flame" ? "🔥" : rt?.icon === "heart" ? "❤️" : "🏆";
              return (
                <div key={r.id} className="bg-card rounded-xl p-4 shadow-card border border-border flex items-center gap-4">
                  <span className="text-2xl">{iconEmoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{rt?.title || "Награда"}</p>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(r.awarded_at).toLocaleDateString("ru")}</p>
                  </div>
                  <span className="text-sm font-bold text-primary">+{rt?.points || 0}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CareerTrack;
