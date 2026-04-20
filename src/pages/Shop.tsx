import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useMyBalance, useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, ClipboardList } from "lucide-react";

export default function Shop() {
  const { data: profile } = useUserProfile();
  const { data: balance = 0 } = useMyBalance();
  const { data: settings } = useCurrencySettings();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["shop_products", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from("shop_products")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id,
  });

  const icon = settings?.currency_icon ?? "🪙";
  const name = settings?.currency_name ?? "Монеты";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🛍️ Магазин</h1>
          <p className="text-muted-foreground">Покупайте товары за {name.toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-4 py-2 flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-xs text-muted-foreground">Баланс</p>
              <p className="font-bold text-lg">{formatCoins(balance)} <span className="text-sm font-normal">{name}</span></p>
            </div>
          </Card>
          <Button asChild variant="outline" size="icon"><Link to="/cart"><ShoppingCart /></Link></Button>
          <Button asChild variant="outline" size="icon"><Link to="/my-orders"><ClipboardList /></Link></Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : products.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          В магазине пока нет товаров
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p: any) => (
            <Link key={p.id} to={`/shop/${p.id}`}>
              <Card className="overflow-hidden hover:shadow-lg transition-shadow h-full">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-16 h-16 text-muted-foreground" />
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-semibold line-clamp-2">{p.title}</h3>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-bold text-primary text-lg">{formatCoins(p.price)} {icon}</span>
                    {p.max_per_user && <Badge variant="outline" className="text-xs">макс. {p.max_per_user}</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
