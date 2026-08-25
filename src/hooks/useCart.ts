import { useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useUserProfile } from "@/hooks/useUserProfile";

/**
 * Единая логика добавления товара в корзину (каталог + карточка товара).
 * Раньше она жила только в карточке товара, из-за чего в каталоге не было
 * кнопки «в корзину», а дубли логики расходились по scope (user_id/company_id).
 */
export function useAddToCart() {
  const userId = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      if (!userId || !profile?.company_id) throw new Error("Не удалось определить пользователя или компанию");

      const { data: existing, error: findError } = await laravelDb
        .from("shop_cart_items")
        .select("*")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        const { error } = await laravelDb
          .from("shop_cart_items")
          .update({ quantity: Number(existing.quantity ?? 0) + quantity })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("shop_cart_items").insert({
          user_id: userId,
          company_id: profile.company_id,
          product_id: productId,
          quantity,
        });
        if (error) throw error;
      }
      return productId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_cart"] });
    },
  });
}
