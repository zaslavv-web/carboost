import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Check, Clock, AlertCircle, ChevronDown, ChevronRight, Target, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig = {
  completed: { label: "Завершено", color: "bg-success", textColor: "text-success" },
  in_progress: { label: "В процессе", color: "bg-info", textColor: "text-info" },
  at_risk: { label: "Под угрозой", color: "bg-destructive", textColor: "text-destructive" },
};

const CareerTrack = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: "", description: "", deadline: "" });

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["career_goals_full", user?.id],
    queryFn: async () => {
      const { data: goalsData, error: goalsErr } = await supabase
        .from("career_goals")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (goalsErr) throw goalsErr;

      const goalIds = (goalsData || []).map((g) => g.id);
      if (goalIds.length === 0) return [];

      const { data: items, error: itemsErr } = await supabase
        .from("goal_checklist_items")
        .select("*")
        .in("goal_id", goalIds)
        .order("created_at", { ascending: true });
      if (itemsErr) throw itemsErr;

      return (goalsData || []).map((g) => ({
        ...g,
        checklist: (items || []).filter((i) => i.goal_id === g.id),
      }));
    },
    enabled: !!user,
  });

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
        user_id: user!.id,
        title: newGoal.title,
        description: newGoal.description || null,
        deadline: newGoal.deadline || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career_goals_full"] });
      setShowAddGoal(false);
      setNewGoal({ title: "", description: "", deadline: "" });
      toast.success("Цель добавлена");
    },
    onError: () => toast.error("Ошибка при добавлении цели"),
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

    // Recalculate progress
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      const updatedChecklist = goal.checklist.map((c: any) => c.id === itemId ? { ...c, is_done: newDone } : c);
      const total = updatedChecklist.length;
      const done = updatedChecklist.filter((c: any) => c.is_done).length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      const status = progress === 100 ? "completed" : progress > 0 ? "in_progress" : "in_progress";
      await updateGoalProgressMutation.mutateAsync({ goalId, progress, status });
      queryClient.invalidateQueries({ queryKey: ["career_goals_full"] });
    }
  };

  const totalProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Мой карьерный трек</h1>
          <p className="text-muted-foreground text-sm mt-1">Ваш персональный план развития</p>
        </div>
        <button
          onClick={() => setShowAddGoal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm"
        >
          <Plus className="w-4 h-4" /> Новая цель
        </button>
      </div>

      {/* Add goal form */}
      {showAddGoal && (
        <div className="bg-card rounded-xl p-6 shadow-card border border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Новая карьерная цель</h3>
            <button onClick={() => setShowAddGoal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <input
            type="text"
            placeholder="Название цели"
            value={newGoal.title}
            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="text"
            placeholder="Описание (необязательно)"
            value={newGoal.description}
            onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="date"
            value={newGoal.deadline}
            onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={() => addGoalMutation.mutate()}
            disabled={!newGoal.title || addGoalMutation.isPending}
            className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {addGoalMutation.isPending ? "Сохранение..." : "Создать цель"}
          </button>
        </div>
      )}

      {/* Overall progress */}
      {goals.length > 0 && (
        <div className="bg-card rounded-xl p-6 shadow-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                <Target className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Общий прогресс</h3>
                <p className="text-sm text-muted-foreground">{goals.filter((g) => g.status === "completed").length} из {goals.length} целей завершено</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-foreground">{totalProgress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${totalProgress}%` }} />
          </div>
        </div>
      )}

      {/* Goals */}
      <div className="space-y-4">
        {goals.length === 0 && !showAddGoal && (
          <div className="bg-card rounded-xl p-12 shadow-card border border-border text-center">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Нет карьерных целей</h3>
            <p className="text-sm text-muted-foreground mb-4">Создайте первую цель для начала карьерного развития</p>
            <button onClick={() => setShowAddGoal(true)} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
              Создать цель
            </button>
          </div>
        )}

        {goals.map((goal) => {
          const config = statusConfig[goal.status as keyof typeof statusConfig] || statusConfig.in_progress;
          const isExpanded = expandedGoal === goal.id;
          return (
            <div key={goal.id} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
              <button
                onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                className="w-full p-5 flex items-center gap-4 text-left hover:bg-secondary/30 transition-colors"
              >
                <div className={`w-3 h-3 rounded-full ${config.color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-foreground ${goal.status === "completed" ? "line-through opacity-60" : ""}`}>
                      {goal.title}
                    </h3>
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
                        <button
                          onClick={(e) => { e.preventDefault(); handleToggle(goal.id, item.id, item.is_done); }}
                          disabled={toggleItemMutation.isPending}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            item.is_done ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                          }`}
                        >
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
                  {/* Add checklist item */}
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Новая задача..."
                      value={newItemText[goal.id] || ""}
                      onChange={(e) => setNewItemText({ ...newItemText, [goal.id]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newItemText[goal.id]?.trim()) {
                          addChecklistItemMutation.mutate({ goalId: goal.id, text: newItemText[goal.id].trim() });
                          setNewItemText({ ...newItemText, [goal.id]: "" });
                        }
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                    <button
                      onClick={() => {
                        if (newItemText[goal.id]?.trim()) {
                          addChecklistItemMutation.mutate({ goalId: goal.id, text: newItemText[goal.id].trim() });
                          setNewItemText({ ...newItemText, [goal.id]: "" });
                        }
                      }}
                      disabled={!newItemText[goal.id]?.trim()}
                      className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CareerTrack;
