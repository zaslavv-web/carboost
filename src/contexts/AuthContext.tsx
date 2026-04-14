import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearPendingSocialSignup, getPendingSocialSignup } from "@/lib/pendingSocialSignup";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const syncPendingSocialSignup = async (user: User) => {
  const pendingSignup = getPendingSocialSignup();
  if (!pendingSignup) return;

  const [{ data: roles, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("id, company_id, requested_role, is_verified")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (rolesError) throw rolesError;
  if (profileError) throw profileError;

  const isSuperadmin = (roles || []).some((entry) => entry.role === "superadmin");
  if (isSuperadmin || (profile?.is_verified && !!profile.company_id)) {
    clearPendingSocialSignup();
    return;
  }

  const profilePayload = {
    company_id: pendingSignup.companyId,
    requested_role: pendingSignup.requestedRole,
  };

  if (profile?.id) {
    const { error: updateError } = await supabase.from("profiles").update(profilePayload).eq("id", profile.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from("profiles").insert({
      user_id: user.id,
      full_name: user.user_metadata?.full_name ?? user.email ?? "",
      is_verified: false,
      ...profilePayload,
    });
    if (insertError) throw insertError;
  }

  const { error: authUpdateError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      company_id: pendingSignup.companyId,
      requested_role: pendingSignup.requestedRole,
    },
  });

  if (authUpdateError) {
    console.error("Failed to sync auth metadata", authUpdateError);
  }

  clearPendingSocialSignup();
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hydrateSession = async (nextSession: Session | null) => {
      setSession(nextSession);

      if (nextSession?.user) {
        try {
          await syncPendingSocialSignup(nextSession.user);
        } catch (error) {
          console.error("Failed to complete social signup", error);
        }
      }

      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrateSession(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      void hydrateSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
