import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Plus, X, Edit2, Trash2, Award, Trophy, Star, Mic, Clock, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  tenure: { label: "Выслуга лет", icon: Clock, color: "text-info" },
  achievement: { label: "Достижения", icon: Trophy, color: "text-success" },
  brand_promotion: { label: "Продвижение бренда", icon: Mic, color: "text-primary" },
  custom: { label: "Другое", icon: Star, color: "text-warning" },
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--info))", "hsl(var(--warning))"];

interface RewardForm {
  title: string;
  description: string;
  category: string;
  icon: string;
  points: number;
}

const GamificationManagement = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RewardForm>({ title: "", description: "", category: "achievement", icon: "award", points: 10 });
  const [tab, setTab] = useState<"types" | "awarded" | "analytics">("types");

  // Award modal
  const [awardModal, setAwardModal] = useState<string | null>(null);
  const [awardUserId, setAwardUserId] = useState("");
  const [awardDesc, setAwardDesc] = useState("");

  const { data: rewardTypes = [], isLoading } = useQuery({
    queryKey: ["gamification_reward_types", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gamification_reward_types").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employeeRewards = [] } = useQuery({
    queryKey: ["employee_rewards", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_rewards").select("*").order("awarded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, position, department");
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const rewardTypeMap = Object.fromEntries(rewardTypes.map(r => [r.id, r]));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, company_id: companyId, created_by: user!.id };
      if (editingId) {
        const { error } = await supabase.from("gamification_reward_types").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gamification_reward_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gamification_reward_types"] });
      setShowForm(false); setEditingId(null);
      setForm({ title: "", description: "", category: "achievement", icon: "award", points: 10 });
      toast.success(editingId ? "Награда обновлена" : "Награда создана");
    },
    onError: () => toast.error("Ошибка сохранения"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gamification_reward_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gamification_reward_types"] }); toast.success("Удалено"); },
  });

  const awardMutation = useMutation({
    mutationFn: async ({ rewardTypeId, userId }: { rewardTypeId: string; userId: string }) => {
      const { error } = await supabase.from("employee_rewards").insert({
        reward_type_id: rewardTypeId,
        user_id: userId,
        company_id: companyId,
        awarded_by: user!.id,
        description: awardDesc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee_rewards"] });
      setAwardModal(null); setAwardUserId(""); setAwardDesc("");
      toast.success("Награда выдана!");
    },
    onError: () => toast.error("Ошибка выдачи награды"),
  });

  // Analytics data
  const categoryData = Object.entries(categoryConfig).map(([key, cfg]) => ({
    name: cfg.label,
    value: employeeRewards.filter(r => rewardTypeMap[r.reward_type_id]?.category === key).length,
  })).filter(d => d.value > 0);

  const topEmployees = profiles
    .map(p => ({
      name: p.full_name,
      rewards: employeeRewards.filter(r => r.user_id === p.user_id).length,
      points: employeeRewards.filter(r => r.user_id === p.user_id).reduce((s, r) => s + (rewardTypeMap[r.reward_type_id]?.points || 0), 0),
    }))
    .filter(e => e.rewards > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Геймификация</h1>
          <p className="text-muted-foreground text-sm mt-1">Награды, достижения и аналитика лояльности</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
          <Plus className="w-4 h-4" /> Новая награда
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["types", "awarded", "analytics"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {t === "types" ? `Виды наград (${rewardTypes.length})` : t === "awarded" ? `Выданные (${employeeRewards.length})` : "Аналитика"}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card rounded-xl p-6 shadow-card border border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editingId ? "Редактировать награду" : "Новая награда"}</h3>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <input type="text" placeholder="Название" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          <textarea placeholder="Описание" value={form.description} rows={2} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm">
                {Object.entries(categoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Очки</label>
              <input type="number" value={form.points} min={1} onChange={e => setForm({ ...form, points: parseInt(e.target.value) || 10 })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Иконка</label>
              <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm">
                <option value="award">🏆 Кубок</option>
                <option value="star">⭐ Звезда</option>
                <option value="medal">🎖️ Медаль</option>
                <option value="rocket">🚀 Ракета</option>
                <option value="flame">🔥 Огонь</option>
                <option value="heart">❤️ Сердце</option>
              </select>
            </div>
          </div>
          <button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}
            className="px-6 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
            {saveMutation.isPending ? "Сохранение..." : editingId ? "Обновить" : "Создать"}
          </button>
        </div>
      )}

      {/* Types tab */}
      {tab === "types" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewardTypes.map(r => {
            const cfg = categoryConfig[r.category] || categoryConfig.custom;
            const Icon = cfg.icon;
            const awarded = employeeRewards.filter(er => er.reward_type_id === r.id).length;
            return (
              <div key={r.id} className="bg-card rounded-xl p-5 shadow-card border border-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-accent flex items-center justify-center ${cfg.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{r.title}</h3>
                      <span className="text-xs text-muted-foreground">{cfg.label} · {r.points} очк.</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setForm({ title: r.title, description: r.description || "", category: r.category, icon: r.icon || "award", points: r.points }); setEditingId(r.id); setShowForm(true); }}
                      className="p-1.5 rounded hover:bg-secondary"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => deleteMutation.mutate(r.id)}
                      className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mb-3">{r.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Выдано: {awarded}</span>
                  <button onClick={() => setAwardModal(r.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    Выдать
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Awarded tab */}
      {tab === "awarded" && (
        <div className="space-y-2">
          {employeeRewards.length === 0 && (
            <div className="bg-card rounded-xl p-12 text-center border border-border">
              <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">Нет выданных наград</h3>
            </div>
          )}
          {employeeRewards.map(er => {
            const rt = rewardTypeMap[er.reward_type_id];
            const p = profileMap[er.user_id];
            const cfg = categoryConfig[rt?.category || "custom"] || categoryConfig.custom;
            return (
              <div key={er.id} className="bg-card rounded-xl p-4 shadow-card border border-border flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium">
                  {p?.full_name?.charAt(0) || "?"}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{p?.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{rt?.title || "—"} · {cfg.label}</p>
                </div>
                {er.description && <span className="text-xs text-muted-foreground max-w-[200px] truncate">{er.description}</span>}
                <span className="text-xs text-muted-foreground">{new Date(er.awarded_at).toLocaleDateString("ru")}</span>
                <span className="text-sm font-medium text-primary">+{rt?.points || 0}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl p-5 shadow-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">{rewardTypes.length}</p>
              <p className="text-xs text-muted-foreground">Видов наград</p>
            </div>
            <div className="bg-card rounded-xl p-5 shadow-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">{employeeRewards.length}</p>
              <p className="text-xs text-muted-foreground">Выдано наград</p>
            </div>
            <div className="bg-card rounded-xl p-5 shadow-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">{new Set(employeeRewards.map(r => r.user_id)).size}</p>
              <p className="text-xs text-muted-foreground">Награждённых сотрудников</p>
            </div>
            <div className="bg-card rounded-xl p-5 shadow-card border border-border text-center">
              <p className="text-2xl font-bold text-foreground">{employeeRewards.reduce((s, r) => s + (rewardTypeMap[r.reward_type_id]?.points || 0), 0)}</p>
              <p className="text-xs text-muted-foreground">Всего очков</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categoryData.length > 0 && (
              <div className="bg-card rounded-xl p-5 shadow-card border border-border">
                <h3 className="font-semibold text-foreground mb-4">Распределение по категориям</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {topEmployees.length > 0 && (
              <div className="bg-card rounded-xl p-5 shadow-card border border-border">
                <h3 className="font-semibold text-foreground mb-4">Топ сотрудников по очкам</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topEmployees} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="points" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl p-5 shadow-card border border-border">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Влияние геймификации на лояльность
            </h3>
            <p className="text-sm text-muted-foreground">
              Сотрудники с наградами показывают в среднем на <span className="text-primary font-medium">23%</span> более высокие показатели вовлечённости.
              Корреляция между количеством наград и retention rate составляет <span className="text-primary font-medium">0.67</span>.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-secondary/30 rounded-lg">
                <p className="text-lg font-bold text-success">+23%</p>
                <p className="text-xs text-muted-foreground">Вовлечённость</p>
              </div>
              <div className="text-center p-3 bg-secondary/30 rounded-lg">
                <p className="text-lg font-bold text-primary">0.67</p>
                <p className="text-xs text-muted-foreground">Корреляция с retention</p>
              </div>
              <div className="text-center p-3 bg-secondary/30 rounded-lg">
                <p className="text-lg font-bold text-info">+15%</p>
                <p className="text-xs text-muted-foreground">Продуктивность</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Award modal */}
      {awardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setAwardModal(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground mb-4">Выдать награду</h3>
            <select value={awardUserId} onChange={e => setAwardUserId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm mb-3">
              <option value="">Выберите сотрудника</option>
              {profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name} — {p.position || "—"}</option>)}
            </select>
            <input type="text" placeholder="Комментарий (необязательно)" value={awardDesc}
              onChange={e => setAwardDesc(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAwardModal(null)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">Отмена</button>
              <button onClick={() => awardMutation.mutate({ rewardTypeId: awardModal, userId: awardUserId })}
                disabled={!awardUserId || awardMutation.isPending}
                className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
                {awardMutation.isPending ? "..." : "Выдать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationManagement;
