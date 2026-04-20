import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, ClipboardList } from "lucide-react";

const STATUS: Record<string, { label: string; variant: any }> = {
  pending_fulfillment: { label: "Ожидает выдачи", variant: "secondary" },
  fulfilled: { label: "Выдан", variant: "default" },
  cancelled: { label: "Отменён", variant: "destructive" },
};

export default function MyOrders() {
  const userId = useEffectiveUserId();
  const { data: settings } = useCurrencySettings();
  const icon = settings?.currency_icon ?? "🪙";

  const { data: orders = [] } = useQuery({
    queryKey: ["shop_orders_my", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, items:shop_order_items(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm"><Link to="/shop"><ArrowLeft className="mr-1" /> Назад в магазин</Link></Button>
      <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList /> Мои заказы</h1>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />У вас ещё нет заказов
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">Заказ #{o.id.substring(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("ru-RU")}</p>
                  </div>
                  <Badge variant={(STATUS[o.status]?.variant) ?? "outline"}>{STATUS[o.status]?.label ?? o.status}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {o.items?.map((it: any) => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.product_title} × {it.quantity}</span>
                      <span>{formatCoins(it.subtotal)} {icon}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Итого:</span><span>{formatCoins(o.total_amount)} {icon}</span>
                </div>
                {o.cancel_reason && (
                  <p className="text-sm text-destructive">Причина отмены: {o.cancel_reason}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
