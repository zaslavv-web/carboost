/**
 * Личная страница сотрудника `/me`.
 * Аватар, картинка для чатов, текущий уровень, награды, достижения,
 * краткий блок карьерного трека и ссылка на цифровой паспорт.
 *
 * Картинка для чата и аватар хранятся в bucket `reward-images` (уже доступен),
 * URL — на профиле (avatar_url) и в localStorage (chat_sticker_<userId>),
 * поскольку поле chat_sticker_url на бэкенде пока не заведено.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { useUserProfile, useEffectiveUserId } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useEmployeeLevel } from "@/hooks/useEmployeeLevel";
import { LevelBadge } from "@/components/gamification/LevelBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import {
  Award, Trophy, Gift, Banknote, Package, Image as ImageIcon, Upload, Trash2,
  Loader2, Calendar, Mail, Briefcase, MapPin, Route as RouteIcon, FileBadge, Sparkles,
} from "lucide-react";

const CHAT_STICKER_KEY = (uid: string) => `chat_sticker_${uid}`;

const REWARD_KIND_ICON: Record<string, any> = {
  achievement: Trophy, digital_gift: Gift, non_monetary: Package, monetary: Banknote,
};

const MyProfile = () => {
  const uid = useEffectiveUserId();
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();

  const initials = useMemo(() => {
    const n = (profile?.full_name || "").trim();
    if (!n) return "?";
    return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  }, [profile?.full_name]);

  /* ===== Награды и достижения ===== */
  const { data: rewards = [] } = useQuery({
    queryKey: ["my_rewards", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("employee_rewards").select("*").eq("user_id", uid!)
        .order("awarded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rewardTypes = [] } = useQuery({
    queryKey: ["reward_types_all"],
    queryFn: async () => {
      const { data, error } = await laravelDb.from("gamification_reward_types").select("*");
      if (error) throw error;
      return data || [];
    },
  });
  const typeMap = useMemo(() => new Map(rewardTypes.map((r: any) => [r.id, r])), [rewardTypes]);

  const { data: achievements = [] } = useQuery({
    queryKey: ["my_achievements", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("achievements").select("*").eq("user_id", uid!)
        .order("achievement_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  /* ===== Карьерный трек ===== */
  const { data: careerAssignment } = useQuery({
    queryKey: ["my_career_assignment", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("employee_career_assignments" as any).select("*")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });

  /* ===== Уровень ===== */
  const levelQ = useEmployeeLevel({
    userId: uid,
    companyId: profile?.company_id ?? null,
    hireDate: profile?.hire_date ?? null,
  });

  /* ===== Аватар upload ===== */
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const updateAvatar = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await laravelDb.from("profiles").update({ avatar_url: url }).eq("user_id", uid!);
      if (error) throw error;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Аватар обновлён");
    },
    onError: (e: any) => toast.error(e.message || "Не удалось обновить аватар"),
  });

  const handleAvatar = async (file: File) => {
    if (!user || !uid) return;
    setAvatarBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `avatars/${uid}/${Date.now()}.${ext}`;
      const up = await laravelStorage.from("reward-images").upload(path, file, { upsert: false });
      if (up.error) throw new Error(up.error.message);
      const { data: pub } = laravelStorage.from("reward-images").getPublicUrl(path);
      await updateAvatar.mutateAsync(pub.publicUrl);
    } catch (e: any) {
      toast.error(e.message || "Ошибка загрузки");
    } finally {
      setAvatarBusy(false);
    }
  };

  /* ===== Картинка для чатов ===== */
  const [chatSticker, setChatSticker] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    setChatSticker(localStorage.getItem(CHAT_STICKER_KEY(uid)));
  }, [uid]);
  const stickerInput = useRef<HTMLInputElement>(null);
  const [stickerBusy, setStickerBusy] = useState(false);

  const handleSticker = async (file: File) => {
    if (!user || !uid) return;
    setStickerBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `chat-stickers/${uid}/${Date.now()}.${ext}`;
      const up = await laravelStorage.from("reward-images").upload(path, file, { upsert: false });
      if (up.error) throw new Error(up.error.message);
      const { data: pub } = laravelStorage.from("reward-images").getPublicUrl(path);
      localStorage.setItem(CHAT_STICKER_KEY(uid), pub.publicUrl);
      setChatSticker(pub.publicUrl);
      toast.success("Картинка для чатов сохранена");
    } catch (e: any) {
      toast.error(e.message || "Ошибка загрузки");
    } finally {
      setStickerBusy(false);
    }
  };

  const removeSticker = () => {
    if (!uid) return;
    localStorage.removeItem(CHAT_STICKER_KEY(uid));
    setChatSticker(null);
  };

  const level = levelQ.data;

  return (
    <div className="space-y-6 animate-fade-in max-w-[1200px] mx-auto">
      {/* Шапка */}
      <Card className="overflow-hidden">
        <div className="h-24 gradient-hero" />
        <CardContent className="px-6 pb-6 -mt-12">
          <div className="flex items-end gap-5 flex-wrap">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-card border-4 border-card overflow-hidden flex items-center justify-center text-2xl font-bold gradient-primary text-primary-foreground">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : initials}
              </div>
              <button
                onClick={() => avatarInput.current?.click()}
                disabled={avatarBusy}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-50"
                title="Сменить аватар"
              >
                {avatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
              <input ref={avatarInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])} />
            </div>

            <div className="flex-1 min-w-[220px] pb-1">
              <h1 className="text-2xl font-bold text-foreground">{profile?.full_name || "—"}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                {profile?.position && <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{profile.position}</span>}
                {profile?.department && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.department}</span>}
                {profile?.hire_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />с {format(new Date(profile.hire_date), "MMM yyyy", { locale: getDateLocale() })}</span>}
                {(profile as any)?.email && <a href={`mailto:${(profile as any).email}`} className="flex items-center gap-1 text-primary hover:underline"><Mail className="w-3.5 h-3.5" />{(profile as any).email}</a>}
              </div>
            </div>

            {level && (
              <div className="flex items-center gap-3 pb-1">
                <LevelBadge level={level.current} size="lg" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Уровень */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Уровень и прогресс
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Растёт за награды, достижения и выслугу лет.
                </p>
              </div>
              {level && <LevelBadge level={level.current} size="md" />}
            </div>

            {levelQ.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : level ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-secondary/40 p-3 text-center">
                    <p className="text-2xl font-bold">{level.points}</p>
                    <p className="text-xs text-muted-foreground">очков</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3 text-center">
                    <p className="text-2xl font-bold">{level.achievementsCount}</p>
                    <p className="text-xs text-muted-foreground">достижений</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3 text-center">
                    <p className="text-2xl font-bold">{level.tenureMonths}</p>
                    <p className="text-xs text-muted-foreground">мес. в компании</p>
                  </div>
                </div>

                {level.next ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">До «{level.next.title}»</span>
                      <span className="font-medium">{level.pointsToNext} очк.</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.round(level.progressToNext * 100)}%`, backgroundColor: level.next.color }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Также нужно: выслуга {level.next.min_tenure_months} мес., достижений {level.next.min_achievements}.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-success">Максимальный уровень достигнут 🎉</p>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Картинка для чатов */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary" /> Картинка для чатов
            </h2>
            <p className="text-xs text-muted-foreground">
              Стикер/аватарка, которую вы можете отправлять в сообщениях.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden bg-secondary/30">
                {chatSticker ? (
                  <img src={chatSticker} alt="sticker" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => stickerInput.current?.click()} disabled={stickerBusy}>
                  {stickerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                  {chatSticker ? "Заменить" : "Загрузить"}
                </Button>
                {chatSticker && (
                  <Button size="sm" variant="ghost" onClick={removeSticker} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Удалить
                  </Button>
                )}
              </div>
            </div>
            <input ref={stickerInput} type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSticker(e.target.files[0])} />
          </CardContent>
        </Card>

        {/* Награды */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" /> Награды
              </h2>
              <span className="text-xs text-muted-foreground">{rewards.length}</span>
            </div>
            {rewards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Пока нет наград.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {rewards.slice(0, 9).map((r: any) => {
                  const rt: any = typeMap.get(r.reward_type_id);
                  const Icon = REWARD_KIND_ICON[rt?.reward_kind || "achievement"] || Trophy;
                  return (
                    <div key={r.id} className="rounded-lg border border-border p-3 flex flex-col items-center text-center gap-1.5">
                      {rt?.image_url ? (
                        <img src={rt.image_url} alt={rt?.title} className="w-12 h-12 rounded-md object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-accent flex items-center justify-center text-primary"><Icon className="w-6 h-6" /></div>
                      )}
                      <p className="text-xs font-medium line-clamp-2">{rt?.title || "Награда"}</p>
                      <p className="text-[10px] text-muted-foreground">+{rt?.points || 0} · {format(new Date(r.awarded_at), "dd.MM.yy")}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Достижения */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" /> Достижения
              </h2>
              <span className="text-xs text-muted-foreground">{achievements.length}</span>
            </div>
            {achievements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Пока пусто.</p>
            ) : (
              <ul className="space-y-2">
                {achievements.slice(0, 6).map((a: any) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <Award className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.title}</p>
                      {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/passport" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <FileBadge className="w-3 h-3" /> Полный паспорт →
            </Link>
          </CardContent>
        </Card>

        {/* Карьерный трек */}
        <Card className="lg:col-span-3">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <RouteIcon className="w-4 h-4 text-primary" /> Карьерный трек
              </h2>
              <Link to="/career-track" className="text-xs text-primary hover:underline">Открыть полностью →</Link>
            </div>
            {careerAssignment ? (
              <div className="rounded-lg border border-border p-4 bg-secondary/20">
                <p className="text-sm">
                  <span className="font-medium">Этап {careerAssignment.current_step ?? 1}</span>
                  {careerAssignment.progress != null && <span className="text-muted-foreground"> · прогресс {careerAssignment.progress}%</span>}
                </p>
                {careerAssignment.started_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Назначен {format(new Date(careerAssignment.started_at), "dd MMM yyyy", { locale: getDateLocale() })}
                  </p>
                )}
                {careerAssignment.progress != null && (
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Number(careerAssignment.progress) || 0)}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Карьерный трек ещё не назначен.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MyProfile;
