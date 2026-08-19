import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { laravelDb } from "@/integrations/laravel/db";
import { useEffectiveUserId } from "./useEffectiveUser";
import { useUserProfile } from "./useUserProfile";

export const formatCoins = (n: number) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

export type CurrencySettings = {
  currency_name: string;
  currency_icon: string;
  transfers_enabled: boolean;
  transfer_limit_per_day: number;
};

export type CurrencyTransaction = {
  id: string;
  amount: number;
  kind: string;
  description: string | null;
  created_at: string;
};

export type EarnRule = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  icon: string | null;
  points: number;
  reward_kind: string | null;
  trigger_mode: string | null;
};

export type CurrencyRecipient = {
  user_id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  avatar_url: string | null;
};

/** Баланс + настройки валюты компании + израсходованный дневной лимит. */
export const useCurrencyOverview = () => {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: ["currency_overview", userId],
    queryFn: async () => {
      const { data, error } = await laravel.get<{
        data: { balance: number; settings: CurrencySettings; spent_today: number };
      }>("/currency/balance");
      if (error) throw new Error(error.message);
      return (
        data?.data ?? {
          balance: 0,
          settings: {
            currency_name: "Монеты",
            currency_icon: "🪙",
            transfers_enabled: true,
            transfer_limit_per_day: 1000,
          },
          spent_today: 0,
        }
      );
    },
    staleTime: 60_000,
  });
};

export const useCurrencySettings = () => {
  const { data: profile } = useUserProfile();
  return useQuery({
    queryKey: ["currency_settings", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data, error } = await laravelDb
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
  const overview = useCurrencyOverview();
  return { ...overview, data: overview.data?.balance ?? 0 } as typeof overview & { data: number };
};

export const useMyTransactions = (limit = 50) => {
  const userId = useEffectiveUserId();
  return useQuery({
    queryKey: ["currency_tx_my", userId, limit],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ data: CurrencyTransaction[] }>(
        `/currency/transactions?limit=${limit}`,
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
  });
};

/** Способы заработать валюту — активные правила награждения компании. */
export const useEarnRules = () => {
  const { data: profile } = useUserProfile();
  return useQuery({
    queryKey: ["currency_earn_rules", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ data: EarnRule[] }>("/currency/earn-rules");
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
};

/** Коллеги для перевода валюты. */
export const useCurrencyRecipients = (search = "") => {
  return useQuery({
    queryKey: ["currency_recipients", search],
    queryFn: async () => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data, error } = await laravel.get<{ data: CurrencyRecipient[] }>(`/currency/recipients${qs}`);
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 60_000,
  });
};

export const useTransferCoins = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { recipient_id: string; amount: number; message?: string }) => {
      const { data, error } = await laravel.post<{ ok: boolean; message?: string }>(
        "/currency/transfer",
        payload,
      );
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.message || "Перевод не выполнен");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currency_overview"] });
      qc.invalidateQueries({ queryKey: ["currency_tx_my"] });
    },
  });
};
