import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUserId } from "./useEffectiveUser";
import { useUserProfile } from "./useUserProfile";

export const formatCoins = (n: number) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

export const useCurrencySettings = () => {
  const { data: profile } = useUserProfile();
  return useQuery({
    queryKey: ["currency_settings", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data, error } = await supabase
        .from("company_currency_settings")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { currency_name: "Монеты", currency_icon: "🪙", company_id: profile.company_id };
    },
    enabled: !!profile?.company_id,
  });
};

export const useMyBalance = () => {
  const userId = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  return useQuery({
    queryKey: ["currency_balance", userId, profile?.company_id],
    queryFn: async () => {
      if (!userId || !profile?.company_id) return 0;
      const { data, error } = await supabase
        .from("currency_balances")
        .select("balance")
        .eq("user_id", userId)
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },
    enabled: !!userId && !!profile?.company_id,
  });
};

export const useMyTransactions = (limit = 50) => {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: ["currency_tx_my", userId, limit],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("currency_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });
};
