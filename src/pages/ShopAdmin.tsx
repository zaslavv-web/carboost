import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { laravelStorage } from "@/integrations/laravel/storage";
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
import { Plus, Edit2, Trash2, Package, Coins, ShoppingBag, Check, X, Upload, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const emptyProduct = {
  title: "", description: "", price: 100, image_url: "",
  stock: null as number | null, max_per_user: null as number | null,
  max_per_period: null as number | null, period_kind: "none", is_active: true,
};

export default function ShopAdmin() {
  const { t } = useTranslation("admin");
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
      if (!companyId) throw new Error(t("shopAdmin.errorNoCompany"));
      const payload = {
        company_id: companyId,
        currency_name: currencyName || settings?.currency_name || t("shopAdmin.defaultCurrencyName"),
        currency_icon: currencyIcon || settings?.currency_icon || "🪙",
      };
      const { error } = await laravelDb.from("company_currency_settings").upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("shopAdmin.toastSettingsSaved")); refetchSettings(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ===== Manual award =====
  const { data: employees = [] } = useQuery({
    queryKey: ["company_employees", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await laravelDb.from("profiles").select("user_id, full_name").eq("company_id", companyId);
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
      if (!awardUser || !companyId) throw new Error(t("shopAdmin.errorSelectEmployee"));
      const { error } = await laravelRpc("award_currency", {
        _user_id: awardUser, _company_id: companyId, _amount: awardAmount,
        _kind: "earn_event", _description: awardDesc || t("shopAdmin.defaultAwardDesc"), _reference_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("shopAdmin.toastAwarded", { amount: formatCoins(awardAmount), icon }));
      setAwardAmount(100); setAwardDesc("");
      qc.invalidateQueries({ queryKey: ["company_transactions"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["company_transactions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await laravelDb.from("currency_transactions")
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
      const { data, error } = await laravelDb.from("shop_products").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
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
    if (!file.type.match(/^image\/(jpeg|png|jpg)$/)) { toast.error(t("shopAdmin.errorOnlyJpgPng")); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${companyId}/${Date.now()}.${ext}`;
      const { error } = await laravelStorage.from("shop-products").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = laravelStorage.from("shop-products").getPublicUrl(path);
      setForm((f: any) => ({ ...f, image_url: data.publicUrl }));
      toast.success(t("shopAdmin.toastImageUploaded"));
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!companyId || !user) throw new Error(t("shopAdmin.errorNoData"));
      if (!form.title?.trim()) throw new Error(t("shopAdmin.errorEnterTitle"));
      if (form.description && form.description.length > 200) throw new Error(t("shopAdmin.errorDescTooLong"));
      if (!form.price || form.price <= 0) throw new Error(t("shopAdmin.errorPricePositive"));
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
        const { error } = await laravelDb.from("shop_products").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await laravelDb.from("shop_products").update(payload).eq("id", editing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(t("shopAdmin.toastSaved")); setEditing(null); refetchProducts(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("shop_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("shopAdmin.toastDeleted")); refetchProducts(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ===== Orders =====
  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["admin_orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await laravelDb.from("shop_orders")
        .select("*, items:shop_order_items(*)")
        .eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      // enrich with profile names
      const userIds = [...new Set((data ?? []).map((o: any) => o.user_id))];
      const { data: profiles } = await laravelDb.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));
      return (data ?? []).map((o: any) => ({ ...o, user_name: map.get(o.user_id) || o.user_id }));
    },
    enabled: !!companyId,
  });

  const fulfill = useMutation({
    mutationFn: async ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) => {
      const { error } = await laravelRpc("fulfill_shop_order", { _order_id: id, _approve: approve, _reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("shopAdmin.toastDone")); refetchOrders(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ===== Analytics (считается из уже загруженных заказов) =====
  const analytics = useMemo(() => {
    const paid = orders.filter((o: any) => o.status !== "cancelled");
    const productMap = new Map<string, { title: string; qty: number; amount: number }>();
    const monthMap = new Map<string, { month: string; orders: number; amount: number }>();
    for (const o of paid) {
      for (const it of o.items ?? []) {
        const cur = productMap.get(it.product_title) ?? { title: it.product_title, qty: 0, amount: 0 };
        cur.qty += it.quantity; cur.amount += it.subtotal;
        productMap.set(it.product_title, cur);
      }
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const m = monthMap.get(key) ?? { month: key, orders: 0, amount: 0 };
      m.orders += 1; m.amount += o.total_amount;
      monthMap.set(key, m);
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
    return {
      totalOrders: orders.length,
      fulfilled: orders.filter((o: any) => o.status === "fulfilled").length,
      pending: orders.filter((o: any) => o.status === "pending_fulfillment").length,
      spent: paid.reduce((s: number, o: any) => s + o.total_amount, 0),
      topProducts,
      maxQty: topProducts[0]?.qty ?? 0,
      byMonth: [...monthMap.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12),
    };
  }, [orders]);


  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">🛍️ {t("shopAdmin.title")}</h1>

      <Tabs defaultValue="currency">
        <TabsList>
          <TabsTrigger value="currency"><Coins className="w-4 h-4 mr-1" /> {t("shopAdmin.tabCurrency")}</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-1" /> {t("shopAdmin.tabProducts")}</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="w-4 h-4 mr-1" /> {t("shopAdmin.tabOrders")} {orders.filter((o: any) => o.status === "pending_fulfillment").length > 0 && <Badge className="ml-1">{orders.filter((o: any) => o.status === "pending_fulfillment").length}</Badge>}</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1" /> Аналитика</TabsTrigger>

        </TabsList>

        {/* ===== CURRENCY TAB ===== */}
        <TabsContent value="currency" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("shopAdmin.currencySettingsTitle")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <div><Label>{t("shopAdmin.labelName")}</Label><Input placeholder={settings?.currency_name} value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} /></div>
              <div><Label>{t("shopAdmin.labelIcon")}</Label><Input placeholder={settings?.currency_icon} value={currencyIcon} onChange={(e) => setCurrencyIcon(e.target.value)} /></div>
              <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>{t("shopAdmin.saveBtn")}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("shopAdmin.manualAwardTitle")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-w-2xl">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>{t("shopAdmin.labelEmployee")}</Label>
                  <Select value={awardUser} onValueChange={setAwardUser}>
                    <SelectTrigger><SelectValue placeholder={t("shopAdmin.selectEmployee")} /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{t("shopAdmin.labelAmount")} ({icon})</Label><Input type="number" value={awardAmount} onChange={(e) => setAwardAmount(parseInt(e.target.value) || 0)} /></div>
              </div>
              <div><Label>{t("shopAdmin.labelDescription")}</Label><Input value={awardDesc} onChange={(e) => setAwardDesc(e.target.value)} placeholder={t("shopAdmin.awardPlaceholder")} /></div>
              <Button onClick={() => award.mutate()} disabled={award.isPending}>{t("shopAdmin.awardBtn")}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("shopAdmin.transactionsTitle")}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map((tx: any) => {
                  const emp = employees.find((e: any) => e.user_id === tx.user_id);
                  return (
                    <div key={tx.id} className="flex justify-between items-center text-sm border-b pb-2">
                      <div>
                        <p className="font-medium">{emp?.full_name || tx.user_id.substring(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{tx.description} · {new Date(tx.created_at).toLocaleString("ru-RU")}</p>
                      </div>
                      <span className={`font-bold ${tx.amount > 0 ? "text-success" : "text-destructive"}`}>
                        {tx.amount > 0 ? "+" : ""}{formatCoins(tx.amount)} {icon}
                      </span>
                    </div>
                  );
                })}
                {transactions.length === 0 && <p className="text-muted-foreground text-sm">{t("shopAdmin.noTransactions")}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== PRODUCTS TAB ===== */}
        <TabsContent value="products" className="space-y-4">
          <Button onClick={() => openEdit()}><Plus className="mr-1" /> {t("shopAdmin.newProduct")}</Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p: any) => (
              <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-16 h-16 text-muted-foreground" />}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold">{p.title}</h3>
                    {!p.is_active && <Badge variant="outline">{t("shopAdmin.hidden")}</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                  <p className="font-bold text-primary">{formatCoins(p.price)} {icon}</p>
                  <div className="flex gap-1 pt-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Edit2 className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => { if (confirm(t("shopAdmin.confirmDeleteProduct"))) deleteProduct.mutate(p.id); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
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
                    <Link to={`/orders/${o.id}`} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                      #{o.id.substring(0, 8)} · {new Date(o.created_at).toLocaleString("ru-RU")}
                    </Link>
                  </div>

                  <Badge variant={o.status === "pending_fulfillment" ? "secondary" : o.status === "fulfilled" ? "default" : "destructive"}>
                    {o.status === "pending_fulfillment" ? t("shopAdmin.statusPendingFulfillment") : o.status === "fulfilled" ? t("shopAdmin.statusFulfilled") : t("shopAdmin.statusCancelled")}
                  </Badge>
                </div>
                <div className="text-sm space-y-1">
                  {o.items?.map((it: any) => <div key={it.id}>• {it.product_title} × {it.quantity} = {formatCoins(it.subtotal)} {icon}</div>)}
                </div>
                <div className="font-semibold">{t("shopAdmin.total")} {formatCoins(o.total_amount)} {icon}</div>
                {o.cancel_reason && <p className="text-sm text-destructive">{t("shopAdmin.cancelReason")} {o.cancel_reason}</p>}
                {o.status === "pending_fulfillment" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => fulfill.mutate({ id: o.id, approve: true })}><Check className="mr-1 w-4 h-4" /> {t("shopAdmin.fulfillBtn")}</Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      const r = prompt(t("shopAdmin.cancelPrompt"));
                      if (r) fulfill.mutate({ id: o.id, approve: false, reason: r });
                    }}><X className="mr-1 w-4 h-4" /> {t("shopAdmin.cancelBtn")}</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {orders.length === 0 && <p className="text-muted-foreground">{t("shopAdmin.noOrders")}</p>}
        </TabsContent>

        {/* ===== ANALYTICS TAB ===== */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Заказов всего", value: String(analytics.totalOrders) },
              { label: "Выдано", value: String(analytics.fulfilled) },
              { label: "Ожидают выдачи", value: String(analytics.pending) },
              { label: `Потрачено ${icon}`, value: formatCoins(analytics.spent) },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Топ товаров</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {analytics.topProducts.length === 0 && <p className="text-sm text-muted-foreground">Пока нет заказов</p>}
              {analytics.topProducts.map((p) => (
                <div key={p.title} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{p.title}</span>
                    <span className="text-muted-foreground">{p.qty} шт · {formatCoins(p.amount)} {icon}</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${analytics.maxQty ? (p.qty / analytics.maxQty) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Динамика по месяцам</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {analytics.byMonth.length === 0 && <p className="text-sm text-muted-foreground">Нет данных</p>}
              {analytics.byMonth.map((m) => (
                <div key={m.month} className="flex justify-between text-sm border-b last:border-0 pb-1">
                  <span>{m.month}</span>
                  <span className="text-muted-foreground">{m.orders} заказов · {formatCoins(m.amount)} {icon}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>


      {/* ===== PRODUCT EDIT DIALOG ===== */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? t("shopAdmin.dialogNewProduct") : t("shopAdmin.dialogEditProduct")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("shopAdmin.labelImage")}</Label>
              {form.image_url && <img src={form.image_url} alt="" className="w-32 h-32 object-cover rounded mb-2" />}
              <Input type="file" accept="image/jpeg,image/png" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading} />
            </div>
            <div><Label>{t("shopAdmin.labelTitle")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>{t("shopAdmin.labelDesc")} — {form.description?.length || 0}/200</Label>
              <Textarea maxLength={200} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div><Label>{t("shopAdmin.labelPrice")} ({icon}) *</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("shopAdmin.labelMaxPerUser")}</Label>
                <Input type="number" placeholder={t("shopAdmin.noLimit")} value={form.max_per_user || ""} onChange={(e) => setForm({ ...form, max_per_user: e.target.value ? parseInt(e.target.value) : null })} />
              </div>
              <div>
                <Label>{t("shopAdmin.labelMaxPerPeriod")}</Label>
                <Input type="number" placeholder={t("shopAdmin.noLimit")} value={form.max_per_period || ""} onChange={(e) => setForm({ ...form, max_per_period: e.target.value ? parseInt(e.target.value) : null })} />
              </div>
            </div>
            <div>
              <Label>{t("shopAdmin.labelPeriod")}</Label>
              <Select value={form.period_kind} onValueChange={(v) => setForm({ ...form, period_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("shopAdmin.periodNone")}</SelectItem>
                  <SelectItem value="month">{t("shopAdmin.periodMonth")}</SelectItem>
                  <SelectItem value="quarter">{t("shopAdmin.periodQuarter")}</SelectItem>
                  <SelectItem value="year">{t("shopAdmin.periodYear")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>{t("shopAdmin.activeLabel")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("shopAdmin.cancelDialog")}</Button>
            <Button onClick={() => saveProduct.mutate()} disabled={saveProduct.isPending}>{t("shopAdmin.saveDialog")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
