import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Building2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useRealPrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { laravelDb } from "@/integrations/laravel/db";
import {
  clearPendingSocialSignup,
  getPendingSocialSignup,
  isRequestedAppRole,
  ROLE_OPTIONS,
  type RequestedAppRole,
} from "@/lib/pendingSocialSignup";

const getEmailDomain = (email: string | null | undefined) => {
  if (!email) return "";
  const parts = email.split("@");
  return parts[1]?.toLowerCase().trim() ?? "";
};

const CompleteRegistration = () => {
  const { t } = useTranslation(["auth"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const pendingSignup = useMemo(() => getPendingSocialSignup(), []);

  const [selectedCompanyId, setSelectedCompanyId] = useState(pendingSignup?.companyId ?? "");
  const [selectedRole, setSelectedRole] = useState<RequestedAppRole>(pendingSignup?.requestedRole ?? "employee");
  const [selectedPositionId, setSelectedPositionId] = useState<string>("");
  const [autoMatchedPosition, setAutoMatchedPosition] = useState<{ id: string; title: string } | null>(null);

  const userEmailDomain = useMemo(() => getEmailDomain(user?.email), [user?.email]);

  useEffect(() => {
    if (profile?.company_id) setSelectedCompanyId(profile.company_id);
    if (isRequestedAppRole(profile?.requested_role)) setSelectedRole(profile.requested_role);
  }, [profile?.company_id, profile?.requested_role]);

  useEffect(() => {
    if (realRole === "superadmin" || profile?.company_id) {
      navigate("/", { replace: true });
    }
  }, [navigate, profile?.company_id, realRole]);

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ["public_companies"],
    queryFn: async () => {
      const { laravel } = await import("@/integrations/laravel/client");
      const { data, error } = await laravel.get<Array<{ id: string; name: string }>>("/companies/public");
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_for_registration", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await laravelDb
        .from("positions")
        .select("id, title, department")
        .eq("company_id", selectedCompanyId)
        .order("title");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCompanyId && selectedRole === "employee",
  });

  useEffect(() => {
    let cancelled = false;
    const lookup = async () => {
      if (!selectedCompanyId || !userEmailDomain || selectedRole !== "employee") {
        setAutoMatchedPosition(null);
        return;
      }
      const { data, error } = await laravelDb
        .from("email_domain_position_mappings")
        .select("position_id, positions(id, title)")
        .eq("company_id", selectedCompanyId)
        .eq("email_domain", userEmailDomain)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("domain mapping lookup", error);
        setAutoMatchedPosition(null);
        return;
      }
      const pos = (data as any)?.positions;
      if (pos?.id) {
        setAutoMatchedPosition({ id: pos.id, title: pos.title });
        setSelectedPositionId(pos.id);
      } else {
        setAutoMatchedPosition(null);
      }
    };
    lookup();
    return () => { cancelled = true; };
  }, [selectedCompanyId, userEmailDomain, selectedRole]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("auth:complete.errors.needAuth"));
      if (!selectedCompanyId) throw new Error(t("auth:complete.errors.pickCompany"));
      if (selectedRole === "employee" && !autoMatchedPosition && !selectedPositionId) {
        throw new Error(t("auth:complete.errors.positionRequired"));
      }

      const positionFields =
        selectedRole === "employee"
          ? autoMatchedPosition
            ? { position_id: autoMatchedPosition.id, pending_position_id: null }
            : { position_id: null, pending_position_id: selectedPositionId }
          : { position_id: null, pending_position_id: null };

      const payload = {
        company_id: selectedCompanyId,
        requested_role: selectedRole,
        ...positionFields,
      };

      if (profile?.id) {
        const { error } = await laravelDb.from("profiles").update(payload).eq("id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("profiles").insert({
          user_id: user.id,
          full_name: (user as any).full_name ?? user.email ?? "",
          is_verified: false,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      clearPendingSocialSignup();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (autoMatchedPosition) {
        toast.success(t("auth:complete.toast.autoMatched", { title: autoMatchedPosition.title }));
      } else if (selectedRole === "employee") {
        toast.success(t("auth:complete.toast.pendingHrd"));
      } else {
        toast.success(t("auth:complete.toast.linked"));
      }
      navigate("/", { replace: true });
    },
    onError: (error: Error) => toast.error(error.message || t("auth:complete.errors.saveFailed")),
  });

  if (profileLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const showPositionPicker = selectedRole === "employee" && !!selectedCompanyId && !autoMatchedPosition;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("auth:complete.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth:complete.subtitle")}</p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">{t("auth:complete.company")}</label>
            <select
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              <option value="">{t("auth:complete.companyPlaceholder")}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">{t("auth:complete.role")}</label>
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as RequestedAppRole)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>{t(role.labelKey)}</option>
              ))}
            </select>
          </div>

          {selectedRole === "employee" && autoMatchedPosition && (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
              <div className="text-sm">
                <p className="font-medium text-foreground">{t("auth:complete.autoMatchTitle")}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {t("auth:complete.autoMatchText", { domain: `@${userEmailDomain}`, title: autoMatchedPosition.title })}
                </p>
              </div>
            </div>
          )}

          {showPositionPicker && (
            <div>
              <label className="text-sm font-medium text-foreground">
                {t("auth:complete.position")} <span className="text-destructive">*</span>
              </label>
              <select
                value={selectedPositionId}
                onChange={(event) => setSelectedPositionId(event.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
              >
                <option value="">{t("auth:complete.positionPlaceholder")}</option>
                {positions.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.department ? ` · ${p.department}` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
                <span>{t("auth:complete.positionHint")}</span>
              </div>
              {positions.length === 0 && (
                <p className="mt-1 text-xs text-destructive">{t("auth:complete.noPositions")}</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || companiesLoading || companies.length === 0}
            className="w-full rounded-lg py-2.5 gradient-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? t("auth:complete.saving") : t("auth:complete.save")}
          </button>

          {companies.length === 0 && !companiesLoading && (
            <p className="text-center text-sm text-destructive">{t("auth:complete.noCompanies")}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompleteRegistration;
