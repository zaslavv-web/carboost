/**
 * Похожие сотрудники для пользователя.
 * scope=company — все роли с доступом; scope=global — superadmin/hrd/company_admin.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { useRealPrimaryRole } from "@/hooks/useUserProfile";

type SimilarItem = {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
  position?: string | null;
  department?: string | null;
  company_name?: string | null;
  email?: string | null;
  similarity: number;
  shared_skills: number;
  reasons: string[];
};

const REASON_LABELS: Record<string, string> = {
  same_position: "Та же должность",
  same_department: "Тот же отдел",
  same_track: "Тот же карьерный трек",
};

const UserSimilarEmployees = ({ userId }: { userId: string }) => {
  const realRole = useRealPrimaryRole();
  const canGlobal = ["superadmin", "hrd", "company_admin"].includes(realRole);
  const [scope, setScope] = useState<"company" | "global">("company");

  const { data, isLoading, error } = useQuery({
    queryKey: ["similar_users", userId, scope],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ similar: SimilarItem[] }>(
        `/profiles/${userId}/similar?scope=${scope}&limit=10`,
      );
      if (error) throw new Error(error.message);
      return data!.similar || [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <ScopeBtn active={scope === "company"} onClick={() => setScope("company")}>В компании</ScopeBtn>
        {canGlobal && (
          <ScopeBtn active={scope === "global"} onClick={() => setScope("global")}>По всей платформе</ScopeBtn>
        )}
      </div>

      {isLoading && <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-8" />}
      {error && <div className="text-destructive text-sm">{(error as Error).message}</div>}

      {data && data.length === 0 && (
        <div className="text-center text-muted-foreground py-12 bg-card rounded-xl border border-border">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
          Похожих сотрудников не найдено
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map((s) => (
            <Link
              key={s.user_id}
              to={`/users/${s.user_id}`}
              className="bg-card rounded-xl border border-border p-4 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center shrink-0">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt={s.full_name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    s.full_name.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground truncate">{s.full_name}</p>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">
                      {s.similarity}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.position || "—"}{s.department ? ` • ${s.department}` : ""}
                  </p>
                  {scope === "global" && s.company_name && (
                    <p className="text-xs text-muted-foreground truncate">{s.company_name}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.reasons.map((r) => (
                      <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {REASON_LABELS[r] || (r.startsWith("shared_skills_") ? `Общих навыков: ${r.replace("shared_skills_", "")}` : r)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const ScopeBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
    }`}
  >
    {children}
  </button>
);

export default UserSimilarEmployees;
