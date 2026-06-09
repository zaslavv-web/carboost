import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { Users, Clock, UserCheck, ShieldCheck, Building2, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const SuperadminDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("admin");

  const { data: stats } = useQuery({
    queryKey: ["superadmin_profiles"],
    queryFn: async () => {
      const [profilesRes, rolesRes, companiesRes] = await Promise.all([
        laravelDb.from("profiles").select("user_id, is_verified"),
        laravelDb.from("user_roles").select("user_id, role"),
        laravelDb.from("companies").select("id"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const profiles = profilesRes.data || [];
      const superadminCount = (rolesRes.data || []).filter((r: any) => r.role === "superadmin").length;
      const pending = profiles.filter((p: any) => !p.is_verified).length;
      const verified = profiles.filter((p: any) => p.is_verified).length;
      const companiesCount = companiesRes.data?.length || 0;
      return { total: profiles.length, pending, verified, superadmins: superadminCount, companies: companiesCount };
    },
  });

  const metrics = [
    { icon: Building2, label: t("superadmin.metricCompanies"), value: stats?.companies ?? 0, bg: "bg-primary/10", fg: "text-primary", link: "/companies" },
    { icon: Users, label: t("superadmin.metricTotal"), value: stats?.total ?? 0, bg: "bg-primary/10", fg: "text-primary", link: "/users" },
    { icon: Clock, label: t("superadmin.metricPending"), value: stats?.pending ?? 0, bg: "bg-warning/10", fg: "text-warning", link: "/users" },
    { icon: UserCheck, label: t("superadmin.metricVerified"), value: stats?.verified ?? 0, bg: "bg-success/10", fg: "text-success", link: "/users" },
    { icon: ShieldCheck, label: t("superadmin.metricSuperadmins"), value: stats?.superadmins ?? 0, bg: "bg-info/10", fg: "text-info", link: "/users" },
    { icon: Mail, label: t("superadmin.metricEmail"), value: "SMTP", bg: "bg-primary/10", fg: "text-primary", link: "/email-settings" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superadmin.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("superadmin.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((m) => (
          <div
            key={String(m.label)}
            onClick={() => navigate(m.link)}
            className="bg-card rounded-xl border border-border p-4 cursor-pointer hover:border-primary/30 transition-colors overflow-hidden"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-lg ${m.bg} flex items-center justify-center flex-shrink-0`}>
                <m.icon className={`w-5 h-5 ${m.fg}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-foreground truncate">{m.value}</p>
                <p className="text-xs text-muted-foreground truncate">{m.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/users")}
        className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t("superadmin.manageUsersBtn")}
      </button>
    </div>
  );
};

export default SuperadminDashboard;
