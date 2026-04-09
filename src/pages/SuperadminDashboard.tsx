import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Clock, UserCheck, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AppRole } from "@/hooks/useUserProfile";

const SuperadminDashboard = () => {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["superadmin_profiles"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, is_verified"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const profiles = profilesRes.data || [];
      const superadminCount = (rolesRes.data || []).filter((r: any) => r.role === "superadmin").length;
      const pending = profiles.filter((p: any) => !p.is_verified).length;
      const verified = profiles.filter((p: any) => p.is_verified).length;
      return { total: profiles.length, pending, verified, superadmins: superadminCount };
    },
  });

  const metrics = [
    { icon: Users, label: "Всего", value: stats?.total ?? 0, color: "primary" },
    { icon: Clock, label: "Ожидают", value: stats?.pending ?? 0, color: "warning" },
    { icon: UserCheck, label: "Верифицированы", value: stats?.verified ?? 0, color: "success" },
    { icon: ShieldCheck, label: "Суперадмины", value: stats?.superadmins ?? 0, color: "info" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Панель суперадмина</h1>
        <p className="text-muted-foreground text-sm mt-1">Обзор системы</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            onClick={() => navigate("/users")}
            className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-${m.color}/10 flex items-center justify-center`}>
                <m.icon className={`w-5 h-5 text-${m.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/users")}
        className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Управление пользователями →
      </button>
    </div>
  );
};

export default SuperadminDashboard;
