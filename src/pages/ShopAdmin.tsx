import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Package, Coins, ShoppingBag, Check, X, Upload } from "lucide-react";
import { toast } from "sonner";

const emptyProduct = {
  title: "", description: "", price: 100, image_url: "",
  stock: null as number | null, max_per_user: null as number | null,
  max_per_period: null as number | null, period_kind: "none", is_active: true,
};

export default function ShopAdmin() {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const { data: settings, refetch: refetchSettings } = useCurrencySettings();
  const qc = useQueryClient();
  const companyId = profile?.company_id;
  const icon = settings?.currency_icon ?? "🪙";

  // ===== Currency settings =====
  const [currencyName, setCurrencyName] = useState("");
  const [currencyIcon, setCurrencyIcon] = useState("");
  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Нет компании");
      const payload = {
        company_id: companyId,
        currency_name: currencyName || settings?.currency_name || "Монеты",
        currency_icon: currencyIcon || settings?.currency_icon || "🪙",
      };
      const { error } = await supabase.from("company_currency_settings").upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Настройки сохранены"); refetchSettings(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ===== Manual award =====
  const { data: employees = [] } = useQuery({
    queryKey: ["company_employees", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("profiles").select("user_id, full_name").eq("company_id", companyId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
  const [awardUser, setAwardUser] = useState("");
  const [awardAmount, setAwardAmount] = useState(100);
  const [awardDesc, setAwardDesc] = useState("");
  const award = useMutation({
    mutationFn: async () => {
      if (!awardUser || !companyId) throw new Error("Выберите сотрудника");
      const { error } = await supabase.rpc("award_currency", {
        _user_id: awardUser, _company_id: companyId, _amount: awardAmount,
        _kind: "earn_event", _description: awardDesc || "Начисление за участие в мероприятии", _reference_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Начислено ${formatCoins(awardAmount)} ${icon}`);
      setAwardAmount(100); setAwardDesc("");
      qc.invalidateQueries({ queryKey: ["company_transactions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["company_transactions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("currency_transactions")
        .select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // ===== Products =====
  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ["admin_products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("shop_products").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyProduct);
  const [uploading, setUploading] = useState(false);

  const openEdit = (p?: any) => {
    setEditing(p ?? "new");
    setForm(p ? { ...p } : emptyProduct);
  };

  const handleUpload = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|jpg)$/)) { toast.error("Только JPG/PNG"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${companyId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("shop-products").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("shop-products").getPublicUrl(path);
      setForm((f: any) => ({ ...f, image_url: data.publicUrl }));
      toast.success("Изображение загружено");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error("Нет данных");
      if (!form.title?.trim()) throw new Error("Введите заголовок");
      if (form.description && form.description.length > 200) throw new Error("Описание ≤ 200 символов");
      if (!form.price || form.price <= 0) throw new Error("Цена должна быть > 0");
      const payload: any = {
        company_id: companyId, title: form.title, description: form.description || null,
        price: form.price, image_url: form.image_url || null,
        max_per_user: form.max_per_user || null,
        max_per_period: form.max_per_period || null,
        period_kind: form.period_kind || "none",
        is_active: form.is_active,
      };
      if (editing === "new") {
        payload.created_by = user.id;
        const { error } = await supabase.from("shop_products").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shop_products").update(payload).eq("id", editing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Сохранено"); setEditing(null); refetchProducts(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shop_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Удалено"); refetchProducts(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ===== Orders =====
  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["admin_orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.from("shop_orders")
        .select("*, items:shop_order_items(*)")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      // enrich with profile names
      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));
      return (data ?? []).map((o: any) => ({ ...o, user_name: map.get(o.user_id) || o.user_id }));
    },
    enabled: !!companyId,
  });

  const fulfill = useMutation({
    mutationFn: async ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("fulfill_shop_order", { _order_id: id, _approve: approve, _reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Готово"); refetchOrders(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">🛍️ Магазин и валюта</h1>

      <Tabs defaultValue="currency">
        <TabsList>
          <TabsTrigger value="currency"><Coins className="w-4 h-4 mr-1" /> Валюта</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-1" /> Товары</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="w-4 h-4 mr-1" /> Заказы {orders.filter((o: any) => o.status === "pending_fulfillment").length > 0 && <Badge className="ml-1">{orders.filter((o: any) => o.status === "pending_fulfillment").length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* ===== CURRENCY TAB ===== */}
        <TabsContent value="currency" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Настройки валюты</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <div><Label>Название</Label><Input placeholder={settings?.currency_name} value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} /></div>
              <div><Label>Иконка (эмодзи)</Label><Input placeholder={settings?.currency_icon} value={currencyIcon} onChange={(e) => setCurrencyIcon(e.target.value)} /></div>
              <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Сохранить</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ручное начисление</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-2xl">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Сотрудник</Label>
                  <Select value={awardUser} onValueChange={setAwardUser}>
                    <SelectTrigger><SelectValue placeholder="Выберите…" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Сумма ({icon})</Label><Input type="number" value={awardAmount} onChange={(e) => setAwardAmount(parseInt(e.target.value) || 0)} /></div>
              </div>
              <div><Label>Описание (за что)</Label><Input value={awardDesc} onChange={(e) => setAwardDesc(e.target.value)} placeholder="Например: участие в корпоративе" /></div>
              <Button onClick={() => award.mutate()} disabled={award.isPending}>Начислить</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Журнал транзакций (последние 100)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map((t: any) => {
                  const emp = employees.find((e: any) => e.user_id === t.user_id);
                  return (
                    <div key={t.id} className="flex justify-between items-center text-sm border-b pb-2">
                      <div>
                        <p className="font-medium">{emp?.full_name || t.user_id.substring(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{t.description} · {new Date(t.created_at).toLocaleString("ru-RU")}</p>
                      </div>
                      <span className={`font-bold ${t.amount > 0 ? "text-success" : "text-destructive"}`}>
                        {t.amount > 0 ? "+" : ""}{formatCoins(t.amount)} {icon}
                      </span>
                    </div>
                  );
                })}
                {transactions.length === 0 && <p className="text-muted-foreground text-sm">Транзакций пока нет</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PRODUCTS TAB ===== */}
        <TabsContent value="products" className="space-y-4">
          <Button onClick={() => openEdit()}><Plus className="mr-1" /> Новый товар</Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p: any) => (
              <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-16 h-16 text-muted-foreground" />}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold">{p.title}</h3>
                    {!p.is_active && <Badge variant="outline">скрыт</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <p className="font-bold text-primary">{formatCoins(p.price)} {icon}</p>
                  <div className="flex gap-1 pt-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Edit2 className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm("Удалить товар?")) deleteProduct.mutate(p.id); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ===== ORDERS TAB ===== */}
        <TabsContent value="orders" className="space-y-3">
          {orders.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">{o.user_name}</p>
                    <p className="text-xs text-muted-foreground">#{o.id.substring(0, 8)} · {new Date(o.created_at).toLocaleString("ru-RU")}</p>
                  </div>
                  <Badge variant={o.status === "pending_fulfillment" ? "secondary" : o.status === "fulfilled" ? "default" : "destructive"}>
                    {o.status === "pending_fulfillment" ? "Ожидает выдачи" : o.status === "fulfilled" ? "Выдан" : "Отменён"}
                  </Badge>
                </div>
                <div className="text-sm space-y-1">
                  {o.items?.map((it: any) => <div key={it.id}>• {it.product_title} × {it.quantity} = {formatCoins(it.subtotal)} {icon}</div>)}
                </div>
                <div className="font-semibold">Итого: {formatCoins(o.total_amount)} {icon}</div>
                {o.cancel_reason && <p className="text-sm text-destructive">Причина: {o.cancel_reason}</p>}
                {o.status === "pending_fulfillment" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => fulfill.mutate({ id: o.id, approve: true })}><Check className="mr-1 w-4 h-4" /> Выдано</Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      const r = prompt("Причина отмены:");
                      if (r) fulfill.mutate({ id: o.id, approve: false, reason: r });
                    }}><X className="mr-1 w-4 h-4" /> Отменить</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {orders.length === 0 && <p className="text-muted-foreground">Заказов пока нет</p>}
        </TabsContent>
      </Tabs>

      {/* ===== PRODUCT EDIT DIALOG ===== */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Новый товар" : "Редактировать товар"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Изображение (JPG/PNG)</Label>
              {form.image_url && <img src={form.image_url} alt="" className="w-32 h-32 object-cover rounded mb-2" />}
              <Input type="file" accept="image/jpeg,image/png" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading} />
            </div>
            <div><Label>Заголовок *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Описание (≤200 символов) — {form.description?.length || 0}/200</Label>
              <Textarea maxLength={200} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div><Label>Цена ({icon}) *</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Лимит всего на сотрудника</Label>
                <Input type="number" placeholder="без лимита" value={form.max_per_user || ""} onChange={(e) => setForm({ ...form, max_per_user: e.target.value ? parseInt(e.target.value) : null })} />
              </div>
              <div>
                <Label>Лимит за период</Label>
                <Input type="number" placeholder="без лимита" value={form.max_per_period || ""} onChange={(e) => setForm({ ...form, max_per_period: e.target.value ? parseInt(e.target.value) : null })} />
              </div>
            </div>
            <div>
              <Label>Период</Label>
              <Select value={form.period_kind} onValueChange={(v) => setForm({ ...form, period_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— нет —</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="quarter">Квартал</SelectItem>
                  <SelectItem value="year">Год</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Активен (виден сотрудникам)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            <Button onClick={() => saveProduct.mutate()} disabled={saveProduct.isPending}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
