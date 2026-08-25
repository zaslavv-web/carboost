import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { getIntlLocale } from "@/lib/dateLocale";
import { OrderItemActivation } from "@/components/shop/OrderItemActivation";


const STATUS_VARIANT: Record<string, any> = {
  pending_fulfillment: "secondary",
  fulfilled: "default",
  cancelled: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  pending_fulfillment: "Ожидает выдачи",
  fulfilled: "Выдан",
  cancelled: "Отменён",
};

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const fromAdmin = params.get("from") === "admin";
  const backTo = fromAdmin ? "/shop-admin" : "/my-orders";
  const backLabel = fromAdmin ? "К заказам магазина" : "К заказам";
  const { data: settings } = useCurrencySettings();
  const icon = settings?.currency_icon ?? "🪙";

  const { data: order, isLoading } = useQuery({
    queryKey: ["shop_order", orderId],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("shop_orders")
        .select("*, items:shop_order_items(*)")
        .eq("id", orderId as string)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!orderId,
  });

  const { data: buyer } = useQuery({
    queryKey: ["shop_order_buyer", order?.user_id],
    queryFn: async () => {
      const { data } = await laravelDb
        .from("profiles")
        .select("user_id, full_name")
        .eq("user_id", order.user_id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!order?.user_id,
  });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to={backTo}><ArrowLeft className="mr-1" /> {backLabel}</Link>
      </Button>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Загрузка…</CardContent></Card>
      ) : !order ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />Заказ не найден
        </CardContent></Card>
      ) : (
        <>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">Заказ #{String(order.id).substring(0, 8)}</h1>
              <p className="text-sm text-muted-foreground">
                {new Date(order.created_at).toLocaleString(getIntlLocale())}
              </p>
              {order.user_id && (
                <Link to={`/users/${order.user_id}`} className="text-sm text-primary underline underline-offset-2">
                  {buyer?.full_name || "Открыть профиль покупателя"}
                </Link>
              )}
            </div>
            <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Состав заказа</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(order.items ?? []).map((it: any) => (
                <div key={it.id} className="flex justify-between text-sm border-b last:border-0 pb-2">
                  <span>{it.product_title} × {it.quantity}</span>
                  <span className="whitespace-nowrap">{formatCoins(it.subtotal)} {icon}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-semibold">
                <span>Итого</span>
                <span>{formatCoins(order.total_amount)} {icon}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Получение и активация</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(order.items ?? []).map((it: any) => (
                <OrderItemActivation key={it.id} item={it} canActivate={!fromAdmin && isOwner} />
              ))}
            </CardContent>
          </Card>


          {(order.cancel_reason || order.fulfilled_at) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Обработка</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {order.fulfilled_at && (
                  <p className="text-muted-foreground">
                    Обработан: {new Date(order.fulfilled_at).toLocaleString(getIntlLocale())}
                  </p>
                )}
                {order.cancel_reason && <p className="text-destructive">Причина отмены: {order.cancel_reason}</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
