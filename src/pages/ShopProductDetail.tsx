import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useMyBalance, useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, ShoppingCart, Zap } from "lucide-react";
import { toast } from "sonner";

export default function ShopProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userId = useEffectiveUserId();
  const { data: profile } = useUserProfile();
  const { data: balance = 0 } = useMyBalance();
  const { data: settings } = useCurrencySettings();
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);

  const { data: product, isLoading } = useQuery({
    queryKey: ["shop_product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("shop_products").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const addToCart = useMutation({
    mutationFn: async () => {
      if (!userId || !profile?.company_id || !product) throw new Error("Нет данных");
      const { data: existing } = await supabase
        .from("shop_cart_items").select("*")
        .eq("user_id", userId).eq("product_id", product.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("shop_cart_items")
          .update({ quantity: existing.quantity + qty }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shop_cart_items").insert({
          user_id: userId, company_id: profile.company_id, product_id: product.id, quantity: qty,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Добавлено в корзину");
      qc.invalidateQueries({ queryKey: ["shop_cart"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buyNow = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Нет данных");
      const { data, error } = await supabase.rpc("create_shop_order", {
        _items: [{ product_id: product.id, quantity: qty }],
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Заказ оформлен! Ожидает выдачи HRD");
      qc.invalidateQueries({ queryKey: ["currency_balance"] });
      qc.invalidateQueries({ queryKey: ["shop_orders_my"] });
      navigate("/my-orders");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const icon = settings?.currency_icon ?? "🪙";

  if (isLoading) return <div className="p-8">Загрузка…</div>;
  if (!product) return <div className="p-8">Товар не найден</div>;

  const total = product.price * qty;
  const canAfford = balance >= total;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/shop"><ArrowLeft className="mr-1" /> Назад в магазин</Link></Button>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="aspect-square bg-muted flex items-center justify-center">
            {product.image_url ? (
              <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
            ) : (
              <Package className="w-24 h-24 text-muted-foreground" />
            )}
          </div>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">{product.title}</h1>
            {product.description && <p className="text-muted-foreground">{product.description}</p>}

            <div className="text-3xl font-bold text-primary">{formatCoins(product.price)} {icon}</div>

            {(product.max_per_user || product.max_per_period) && (
              <div className="space-y-1">
                {product.max_per_user && (
                  <Badge variant="outline">Лимит всего: {product.max_per_user} шт.</Badge>
                )}
                {product.max_per_period && product.period_kind !== "none" && (
                  <Badge variant="outline" className="ml-2">
                    {product.max_per_period} шт. /{" "}
                    {product.period_kind === "month" ? "месяц" : product.period_kind === "quarter" ? "квартал" : "год"}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-4">
              <label className="text-sm font-medium">Количество:</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-24" />
            </div>

            <div className="text-sm">Итого: <span className="font-bold">{formatCoins(total)} {icon}</span></div>
            <div className="text-xs text-muted-foreground">Ваш баланс: {formatCoins(balance)} {icon}</div>

            <div className="flex gap-2 pt-4">
              <Button onClick={() => addToCart.mutate()} disabled={addToCart.isPending} variant="outline" className="flex-1">
                <ShoppingCart className="mr-2" /> В корзину
              </Button>
              <Button onClick={() => buyNow.mutate()} disabled={buyNow.isPending || !canAfford} className="flex-1">
                <Zap className="mr-2" /> {canAfford ? "Купить сейчас" : "Недостаточно"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
