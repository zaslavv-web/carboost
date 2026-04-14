import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useRealPrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPendingSocialSignup,
  getPendingSocialSignup,
  isRequestedAppRole,
  ROLE_OPTIONS,
  type RequestedAppRole,
} from "@/lib/pendingSocialSignup";

const CompleteRegistration = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const pendingSignup = useMemo(() => getPendingSocialSignup(), []);

  const [selectedCompanyId, setSelectedCompanyId] = useState(pendingSignup?.companyId ?? "");
  const [selectedRole, setSelectedRole] = useState<RequestedAppRole>(pendingSignup?.requestedRole ?? "employee");

  useEffect(() => {
    if (profile?.company_id) {
      setSelectedCompanyId(profile.company_id);
    }

    if (isRequestedAppRole(profile?.requested_role)) {
      setSelectedRole(profile.requested_role);
    }
  }, [profile?.company_id, profile?.requested_role]);

  useEffect(() => {
    if (realRole === "superadmin" || profile?.company_id) {
      navigate("/", { replace: true });
    }
  }, [navigate, profile?.company_id, realRole]);

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: ["public_companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Требуется авторизация");
      if (!selectedCompanyId) throw new Error("Выберите компанию");

      const payload = {
        company_id: selectedCompanyId,
        requested_role: selectedRole,
      };

      if (profile?.id) {
        const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profiles").insert({
          user_id: user.id,
          full_name: user.user_metadata?.full_name ?? user.email ?? "",
          is_verified: false,
          ...payload,
        });
        if (error) throw error;
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          company_id: selectedCompanyId,
          requested_role: selectedRole,
        },
      });

      if (authError) {
        console.error("Failed to update auth metadata", authError);
      }
    },
    onSuccess: async () => {
      clearPendingSocialSignup();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Профиль привязан к компании");
      navigate("/", { replace: true });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Не удалось сохранить профиль");
    },
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Завершите регистрацию</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Выберите компанию и роль, чтобы открыть доступ к системе и завершить вход.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Компания</label>
            <select
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              <option value="">— Выберите компанию —</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Желаемая роль</label>
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as RequestedAppRole)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || companiesLoading || companies.length === 0}
            className="w-full rounded-lg py-2.5 gradient-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Сохраняем..." : "Сохранить и продолжить"}
          </button>

          {companies.length === 0 && !companiesLoading && (
            <p className="text-center text-sm text-destructive">Нет доступных компаний для регистрации.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompleteRegistration;