/**
 * Карточка пользователя со всеми доступными представлениями:
 *  - Обзор (профиль, компетенции, контакты)
 *  - Окружение (BPMN-граф окружения и проекция через год)
 *  - Похожие сотрудники (в компании / глобально)
 *  - Продуктовая аналитика (только superadmin)
 */
import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { laravel } from "@/integrations/laravel/client";
import { useRealPrimaryRole } from "@/hooks/useUserProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UserBusinessEnvironment from "@/components/UserBusinessEnvironment";
import UserSimilarEmployees from "@/components/UserSimilarEmployees";
import UserProductAnalytics from "@/components/UserProductAnalytics";

type ProfileFull = {
  user_id: string;
  full_name: string;
  position?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  company_id?: string | null;
  roles?: string[];
};

const UserProfileFull = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const realRole = useRealPrimaryRole();
  const isSuperadmin = realRole === "superadmin";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user_profile_full", userId],
    queryFn: async () => {
      const { data, error } = await laravel.get<ProfileFull>(`/profiles/${userId}`);
      if (error) throw new Error(error.message);
      return data!;
    },
    enabled: !!userId,
  });

  const initials = useMemo(() => {
    const n = (profile?.full_name || "").trim();
    if (!n) return "?";
    return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  }, [profile?.full_name]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!profile) {
    return <div className="text-center py-20 text-muted-foreground">Профиль не найден</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="bg-card rounded-xl border border-border p-6 flex items-start gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary text-xl font-semibold flex items-center justify-center shrink-0">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-foreground">{profile.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.position || "—"}
            {profile.department ? ` • ${profile.department}` : ""}
          </p>
          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:underline"
            >
              <Mail className="w-3.5 h-3.5" /> {profile.email}
            </a>
          )}
        </div>
        {profile.roles && profile.roles.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {profile.roles.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue="environment" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="environment">Окружение</TabsTrigger>
          <TabsTrigger value="similar">Похожие сотрудники</TabsTrigger>
          {isSuperadmin && <TabsTrigger value="analytics">Продуктовая аналитика</TabsTrigger>}
        </TabsList>

        <TabsContent value="environment" className="mt-4">
          <UserBusinessEnvironment userId={profile.user_id} />
        </TabsContent>

        <TabsContent value="similar" className="mt-4">
          <UserSimilarEmployees userId={profile.user_id} />
        </TabsContent>

        {isSuperadmin && (
          <TabsContent value="analytics" className="mt-4">
            <UserProductAnalytics userId={profile.user_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default UserProfileFull;
