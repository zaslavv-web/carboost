import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Plus, X, Edit2, Trash2, Award, Trophy, Star, Mic, Clock, TrendingUp, Loader2,
  Gift, Banknote, Package, Image as ImageIcon, Zap, Hand, Search,
} from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  tenure: { label: "Выслуга лет", icon: Clock, color: "text-info" },
  achievement: { label: "Достижения", icon: Trophy, color: "text-success" },
  brand_promotion: { label: "Продвижение бренда", icon: Mic, color: "text-primary" },
  custom: { label: "Другое", icon: Star, color: "text-warning" },
};

const rewardKindConfig: Record<string, { label: string; icon: any }> = {
  achievement: { label: "Ачивка", icon: Trophy },
  digital_gift: { label: "Цифровой подарок", icon: Gift },
  non_monetary: { label: "Неденежное", icon: Package },
  monetary: { label: "Денежное", icon: Banknote },
};

const DEFAULT_EVENTS: { code: string; label: string }[] = [
  { code: "test_passed_high", label: "Тест пройден на ≥80%" },
  { code: "test_completed", label: "Любой тест завершён" },
  { code: "ai_assessment_completed", label: "AI-оценка завершена" },
  { code: "career_goal_achieved", label: "Карьерная цель достигнута" },
  { code: "career_track_completed", label: "Карьерный трек завершён" },
  { code: "position_promotion", label: "Повышение в должности" },
  { code: "hire_anniversary_1y", label: "Годовщина 1 год" },
  { code: "hire_anniversary_3y", label: "Годовщина 3 года" },
  { code: "hire_anniversary_5y", label: "Годовщина 5 лет" },
  { code: "probation_passed", label: "Завершён испытательный срок" },
  { code: "birthday", label: "День рождения" },
  { code: "mentor_newcomer", label: "Наставничество новичка" },
  { code: "brand_publication", label: "Публикация от бренда" },
  { code: "candidate_referral", label: "Рекомендация кандидата" },
  { code: "project_participation", label: "Участие в проекте" },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--info))", "hsl(var(--warning))"];

interface RewardForm {
  title: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  reward_kind: string;
  image_url: string;
  trigger_mode: string;
  trigger_events: string[];
  gift_content: string;
  non_monetary_title: string;
  non_monetary_description: string;
  monetary_amount: number;
  monetary_currency: string;
}

const EMPTY_FORM: RewardForm = {
  title: "", description: "", category: "achievement", icon: "award", points: 10,
  reward_kind: "achievement", image_url: "", trigger_mode: "manual", trigger_events: [],
  gift_content: "", non_monetary_title: "", non_monetary_description: "",
  monetary_amount: 0, monetary_currency: "RUB",
};

const GamificationManagement = () => {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RewardForm>(EMPTY_FORM);
  const [tab, setTab] = useState<"types" | "awarded" | "events" | "analytics">("types");
  const [uploadingImage, setUploadingImage] = useState(false);

  // Custom events stored in localStorage per company
  const eventsKey = `gam_events_${companyId || "global"}`;
  const [customEvents, setCustomEvents] = useState<{ code: string; label: string }[]>(() => {
    try {
      const raw = localStorage.getItem(eventsKey);
      return raw ? JSON.parse(raw) : DEFAULT_EVENTS;
    } catch { return DEFAULT_EVENTS; }
  });
  const [newEventLabel, setNewEventLabel] = useState("");

  const persistEvents = (next: { code: string; label: string }[]) => {
    setCustomEvents(next);
    localStorage.setItem(eventsKey, JSON.stringify(next));
  };

  // Award modal
  const [awardModal, setAwardModal] = useState<string | null>(null);
  const [awardUserIds, setAwardUserIds] = useState<string[]>([]);
  const [awardDesc, setAwardDesc] = useState("");
  const [awardSearch, setAwardSearch] = useState("");

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
    queryKey: ["all_profiles_gam"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, position, department, hire_date");
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const rewardTypeMap = Object.fromEntries(rewardTypes.map(r => [r.id, r]));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        title: form.title,
        description: form.description,
        category: form.category,
        icon: form.icon,
        points: form.points,
        reward_kind: form.reward_kind,
        image_url: form.image_url || null,
        trigger_mode: form.trigger_mode,
        trigger_events: form.trigger_mode === "auto" ? form.trigger_events : [],
        gift_content: form.reward_kind === "digital_gift" ? form.gift_content : null,
        non_monetary_title: form.reward_kind === "non_monetary" ? form.non_monetary_title : null,
        non_monetary_description: form.reward_kind === "non_monetary" ? form.non_monetary_description : null,
        monetary_amount: form.reward_kind === "monetary" ? form.monetary_amount : null,
        monetary_currency: form.reward_kind === "monetary" ? form.monetary_currency : null,
        company_id: companyId,
        created_by: user!.id,
      };
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
      setForm(EMPTY_FORM);
      toast.success(editingId ? "Награда обновлена" : "Награда создана");
    },
    onError: (e: any) => toast.error("Ошибка сохранения: " + (e.message || "")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gamification_reward_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gamification_reward_types"] }); toast.success("Удалено"); },
  });

  const awardMutation = useMutation({
    mutationFn: async ({ rewardTypeId, userIds }: { rewardTypeId: string; userIds: string[] }) => {
      const rows = userIds.map(uid => ({
        reward_type_id: rewardTypeId,
        user_id: uid,
        company_id: companyId,
        awarded_by: user!.id,
        description: awardDesc || null,
      }));
      const { error } = await supabase.from("employee_rewards").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee_rewards"] });
      setAwardModal(null); setAwardUserIds([]); setAwardDesc(""); setAwardSearch("");
      toast.success("Награды выданы!");
    },
    onError: (e: any) => toast.error("Ошибка выдачи: " + (e.message || "")),
  });

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("reward-images").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("reward-images").getPublicUrl(path);
      setForm(f => ({ ...f, image_url: pub.publicUrl }));
      toast.success("Изображение загружено");
    } catch (e: any) {
      toast.error("Ошибка загрузки: " + (e.message || ""));
    } finally {
      setUploadingImage(false);
    }
  };

  const addCustomEvent = () => {
    if (!newEventLabel.trim()) return;
    const code = "custom_" + Date.now();
    persistEvents([...customEvents, { code, label: newEventLabel.trim() }]);
    setNewEventLabel("");
  };
  const removeEvent = (code: string) => persistEvents(customEvents.filter(e => e.code !== code));

  // Analytics
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

  const filteredProfiles = profiles.filter(p =>
    !awardSearch ||
    p.full_name?.toLowerCase().includes(awardSearch.toLowerCase()) ||
    p.position?.toLowerCase().includes(awardSearch.toLowerCase())
  );

  const toggleAwardUser = (uid: string) => {
    setAwardUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const editReward = (r: any) => {
    setForm({
      title: r.title, description: r.description || "", category: r.category, icon: r.icon || "award", points: r.points,
      reward_kind: r.reward_kind || "achievement",
      image_url: r.image_url || "",
      trigger_mode: r.trigger_mode || "manual",
      trigger_events: Array.isArray(r.trigger_events) ? r.trigger_events : [],
      gift_content: r.gift_content || "",
      non_monetary_title: r.non_monetary_title || "",
      non_monetary_description: r.non_monetary_description || "",
      monetary_amount: r.monetary_amount || 0,
      monetary_currency: r.monetary_currency || "RUB",
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Геймификация</h1>
          <p className="text-muted-foreground text-sm mt-1">Награды, события автовыдачи и аналитика лояльности</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
          <Plus className="w-4 h-4" /> Новая награда
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["types", "awarded", "events", "analytics"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {t === "types" ? `Виды наград (${rewardTypes.length})`
              : t === "awarded" ? `Выданные (${employeeRewards.length})`
              : t === "events" ? `События (${customEvents.length})`
              : "Аналитика"}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Reward kind */}
          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border">
            <label className="text-xs text-muted-foreground block">Тип вознаграждения</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(rewardKindConfig).map(([k, v]) => {
                const I = v.icon;
                return (
                  <button key={k} type="button" onClick={() => setForm({ ...form, reward_kind: k })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${form.reward_kind === k ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>
                    <I className="w-4 h-4" /> {v.label}
                  </button>
                );
              })}
            </div>

            {form.reward_kind === "digital_gift" && (
              <textarea placeholder="Содержимое цифрового подарка (текст открытки, сертификат, ссылка...)" value={form.gift_content} rows={2}
                onChange={e => setForm({ ...form, gift_content: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
            )}
            {form.reward_kind === "non_monetary" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" placeholder="Название (например: Билеты в кино)" value={form.non_monetary_title}
                  onChange={e => setForm({ ...form, non_monetary_title: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
                <input type="text" placeholder="Описание" value={form.non_monetary_description}
                  onChange={e => setForm({ ...form, non_monetary_description: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
              </div>
            )}
            {form.reward_kind === "monetary" && (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Сумма" value={form.monetary_amount} min={0}
                  onChange={e => setForm({ ...form, monetary_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
                <select value={form.monetary_currency} onChange={e => setForm({ ...form, monetary_currency: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm">
                  <option value="RUB">RUB ₽</option>
                  <option value="USD">USD $</option>
                  <option value="EUR">EUR €</option>
                  <option value="KZT">KZT ₸</option>
                </select>
              </div>
            )}
          </div>

          {/* Image */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground block">Изображение награды</label>
            <div className="flex items-center gap-3">
              {form.image_url ? (
                <img src={form.image_url} alt="reward" className="w-20 h-20 rounded-lg object-cover border border-border" />
              ) : (
                <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <label className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm cursor-pointer hover:bg-secondary/80">
                {uploadingImage ? "Загрузка..." : (form.image_url ? "Заменить" : "Загрузить")}
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              </label>
              {form.image_url && (
                <button type="button" onClick={() => setForm({ ...form, image_url: "" })}
                  className="text-xs text-destructive hover:underline">Удалить</button>
              )}
            </div>
          </div>

          {/* Trigger mode */}
          <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border">
            <label className="text-xs text-muted-foreground block">Сценарий выдачи</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, trigger_mode: "manual" })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${form.trigger_mode === "manual" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                <Hand className="w-4 h-4" /> Вручную
              </button>
              <button type="button" onClick={() => setForm({ ...form, trigger_mode: "auto" })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${form.trigger_mode === "auto" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                <Zap className="w-4 h-4" /> Автоматически
              </button>
            </div>
            {form.trigger_mode === "auto" && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Выдаётся при наступлении одного из событий:</p>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {customEvents.map(ev => {
                    const active = form.trigger_events.includes(ev.code);
                    return (
                      <button key={ev.code} type="button"
                        onClick={() => setForm({
                          ...form,
                          trigger_events: active ? form.trigger_events.filter(c => c !== ev.code) : [...form.trigger_events, ev.code]
                        })}
                        className={`px-3 py-1.5 rounded-full text-xs border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"}`}>
                        {ev.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Управление списком событий — во вкладке «События».</p>
              </div>
            )}
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
          {rewardTypes.length === 0 && (
            <div className="col-span-full bg-card rounded-xl p-12 text-center border border-border">
              <Award className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-foreground">Создайте первую награду</h3>
            </div>
          )}
          {rewardTypes.map(r => {
            const cfg = categoryConfig[r.category] || categoryConfig.custom;
            const Icon = cfg.icon;
            const KindIcon = (rewardKindConfig[r.reward_kind || "achievement"] || rewardKindConfig.achievement).icon;
            const awarded = employeeRewards.filter(er => er.reward_type_id === r.id).length;
            return (
              <div key={r.id} className="bg-card rounded-xl p-5 shadow-card border border-border flex flex-col">
                {r.image_url && (
                  <img src={r.image_url} alt={r.title} className="w-full h-32 object-cover rounded-lg mb-3" />
                )}
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
                    <button onClick={() => editReward(r)} className="p-1.5 rounded hover:bg-secondary">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => { if (confirm("Удалить награду?")) deleteMutation.mutate(r.id); }}
                      className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                  </div>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mb-3">{r.description}</p>}

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
                    <KindIcon className="w-3 h-3" />
                    {(rewardKindConfig[r.reward_kind || "achievement"] || rewardKindConfig.achievement).label}
                  </span>
                  {r.reward_kind === "monetary" && r.monetary_amount && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">
                      {r.monetary_amount} {r.monetary_currency}
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${r.trigger_mode === "auto" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {r.trigger_mode === "auto" ? <><Zap className="w-3 h-3" /> Авто ({(Array.isArray(r.trigger_events) ? r.trigger_events.length : 0)})</> : <><Hand className="w-3 h-3" /> Ручная</>}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs text-muted-foreground">Выдано: {awarded}</span>
                  <button onClick={() => { setAwardModal(r.id); setAwardUserIds([]); }}
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
              <div key={er.id} className="bg-card rounded-xl p-4 shadow-card border border-border flex items-center gap-4 flex-wrap">
                {rt?.image_url ? (
                  <img src={rt.image_url} alt="" className="w-10 h-10 rounded object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium">
                    {p?.full_name?.charAt(0) || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium text-foreground">{p?.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{rt?.title || "—"} · {cfg.label}</p>
                </div>
                {rt?.reward_kind === "monetary" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
                    {rt.monetary_amount} {rt.monetary_currency}
                  </span>
                )}
                {er.description && <span className="text-xs text-muted-foreground max-w-[200px] truncate">{er.description}</span>}
                <span className="text-xs text-muted-foreground">{new Date(er.awarded_at).toLocaleDateString("ru")}</span>
                <span className="text-sm font-medium text-primary">+{rt?.points || 0}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Events tab */}
      {tab === "events" && (
        <div className="bg-card rounded-xl p-6 shadow-card border border-border space-y-4">
          <div>
            <h3 className="font-semibold text-foreground mb-1">События для автовыдачи наград</h3>
            <p className="text-sm text-muted-foreground">Эти события можно привязать к награде с режимом «Автоматически».</p>
          </div>
          <div className="flex gap-2">
            <input type="text" placeholder="Название нового события" value={newEventLabel}
              onChange={e => setNewEventLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomEvent()}
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <button onClick={addCustomEvent} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
              Добавить
            </button>
          </div>
          <div className="space-y-2">
            {customEvents.map(ev => {
              const isDefault = DEFAULT_EVENTS.find(d => d.code === ev.code);
              const usedBy = rewardTypes.filter(r => (r.trigger_events || []).includes(ev.code)).length;
              return (
                <div key={ev.code} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                  <div>
                    <p className="text-sm text-foreground">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="text-[10px]">{ev.code}</code> · используют наград: {usedBy}
                      {isDefault && <span className="ml-2 px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px]">встроенное</span>}
                    </p>
                  </div>
                  <button onClick={() => removeEvent(ev.code)} className="p-1.5 rounded hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analytics */}
      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <p className="text-xs text-muted-foreground">Награждённых</p>
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
              В будущем здесь появится оценка влияния каждой награды на эффективность сотрудника.
            </p>
          </div>
        </div>
      )}

      {/* Award modal — multi-select */}
      {awardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAwardModal(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground mb-1">Выдать награду</h3>
            <p className="text-xs text-muted-foreground mb-4">Выберите одного или нескольких сотрудников</p>

            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Поиск по ФИО или должности" value={awardSearch}
                onChange={e => setAwardSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-input bg-background text-sm" />
            </div>

            <div className="border border-border rounded-lg max-h-72 overflow-y-auto mb-3">
              {filteredProfiles.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Никого не найдено</p>}
              {filteredProfiles.map(p => {
                const checked = awardUserIds.includes(p.user_id);
                return (
                  <label key={p.user_id}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/40 border-b border-border last:border-0 ${checked ? "bg-primary/5" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAwardUser(p.user_id)} className="w-4 h-4" />
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                      {p.full_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.position || "—"}
                        {p.hire_date && <span> · с {new Date(p.hire_date).toLocaleDateString("ru")}</span>}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <input type="text" placeholder="Комментарий (необязательно)" value={awardDesc}
              onChange={e => setAwardDesc(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm mb-4" />

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Выбрано: {awardUserIds.length}</span>
              <div className="flex gap-2">
                <button onClick={() => setAwardModal(null)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">Отмена</button>
                <button onClick={() => awardMutation.mutate({ rewardTypeId: awardModal, userIds: awardUserIds })}
                  disabled={awardUserIds.length === 0 || awardMutation.isPending}
                  className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm disabled:opacity-50">
                  {awardMutation.isPending ? "..." : `Выдать (${awardUserIds.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationManagement;
