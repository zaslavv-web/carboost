import { laravelDb } from "@/integrations/laravel/db";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useEffectiveUserId } from "@/hooks/useEffectiveUser";
import { useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, ClipboardList } from "lucide-react";
import { getIntlLocale } from "@/lib/dateLocale";

const STATUS_VARIANT: Record<string, any> = {
  pending_fulfillment: "secondary",
  fulfilled: "default",
  cancelled: "destructive",
};

export default function MyOrders() {
  const { t } = useTranslation("employee");
  const userId = useEffectiveUserId();
  const { data: settings } = useCurrencySettings();
  const icon = settings?.currency_icon ?? "🪙";

  const { data: orders = [] } = useQuery({
    queryKey: ["shop_orders_my", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await laravelDb
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
      <Button asChild variant="ghost" size="sm"><Link to="/shop"><ArrowLeft className="mr-1" /> {t("myOrders.back")}</Link></Button>
      <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList /> {t("myOrders.title")}</h1>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />{t("myOrders.empty")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">{t("myOrders.order")} #{o.id.substring(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString(getIntlLocale())}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>{t(`myOrders.status.${o.status}`, o.status)}</Badge>
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
                  <span>{t("myOrders.total")}</span><span>{formatCoins(o.total_amount)} {icon}</span>
                </div>
                {o.cancel_reason && (
                  <p className="text-sm text-destructive">{t("myOrders.cancelReason", { reason: o.cancel_reason })}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
