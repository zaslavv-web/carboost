import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useMyBalance, useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Trash2, Package, ShoppingCart, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function Cart() {
  const userId = useEffectiveUserId();
  const { impersonatedUserId } = useImpersonation();
  const isImpersonating = !!impersonatedUserId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: balance = 0 } = useMyBalance();
  const { data: settings } = useCurrencySettings();
  const icon = settings?.currency_icon ?? "🪙";

  const { data: items = [] } = useQuery({
    queryKey: ["shop_cart", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("shop_cart_items")
        .select("*, product:shop_products(*)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).filter((i: any) => i.product?.is_active);
    },
    enabled: !!userId,
  });

  const updateQty = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      if (quantity <= 0) {
        await supabase.from("shop_cart_items").delete().eq("id", id);
      } else {
        await supabase.from("shop_cart_items").update({ quantity }).eq("id", id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_cart"] }),
  });

  const checkout = useMutation({
    mutationFn: async () => {
      const payload = items.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity }));
      const { data, error } = await supabase.rpc("create_shop_order", { _items: payload });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Заказ оформлен! Ожидает выдачи HRD");
      qc.invalidateQueries({ queryKey: ["shop_cart"] });
      qc.invalidateQueries({ queryKey: ["currency_balance"] });
      qc.invalidateQueries({ queryKey: ["shop_orders_my"] });
      qc.invalidateQueries({ queryKey: ["currency_transactions"] });
      navigate("/my-orders");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const total = items.reduce((s: number, i: any) => s + i.product.price * i.quantity, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/shop"><ArrowLeft className="mr-1" /> Назад</Link></Button>
      <h1 className="text-3xl font-bold flex items-center gap-2"><ShoppingCart /> Корзина</h1>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          Корзина пуста — <Link to="/shop" className="text-primary underline">перейти в магазин</Link>
        </CardContent></Card>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((i: any) => (
              <Card key={i.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-16 h-16 bg-muted rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                    {i.product.image_url ? <img src={i.product.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{i.product.title}</p>
                    <p className="text-sm text-primary font-medium">{formatCoins(i.product.price)} {icon}</p>
                  </div>
                  <Input type="number" min={1} value={i.quantity}
                    onChange={(e) => updateQty.mutate({ id: i.id, quantity: parseInt(e.target.value) || 1 })}
                    className="w-20" />
                  <div className="font-bold whitespace-nowrap">{formatCoins(i.product.price * i.quantity)} {icon}</div>
                  <Button variant="ghost" size="icon" onClick={() => updateQty.mutate({ id: i.id, quantity: 0 })}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between"><span>Итого:</span><span className="font-bold text-xl">{formatCoins(total)} {icon}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>Баланс:</span><span>{formatCoins(balance)} {icon}</span></div>
              <Button className="w-full" size="lg" disabled={checkout.isPending || balance < total} onClick={() => checkout.mutate()}>
                {balance < total ? "Недостаточно средств" : "Оформить заказ"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
