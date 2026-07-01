import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Cloud, Server, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { toast } from "sonner";
import LandingHeader from "@/components/landing/LandingHeader";

type Plan = "cloud" | "on_premise";

const PLAN_ICONS: Record<Plan, typeof Cloud> = { cloud: Cloud, on_premise: Server };

const Pricing = () => {
  const { t } = useTranslation("landing");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", headcount: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const { error } = await laravelRpc("submit_pricing_inquiry", {
      _name: form.name,
      _email: form.email,
      _plan: selected,
      _company: form.company || null,
      _phone: form.phone || null,
      _headcount: form.headcount ? parseInt(form.headcount) : null,
      _message: form.message || null,
      _source: "pricing_page",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("pricing.form.success"));
    setSelected(null);
    setForm({ name: "", email: "", company: "", phone: "", headcount: "", message: "" });
  };

  const plans: Plan[] = ["cloud", "on_premise"];

  return (
    <div className="min-h-dvh bg-background">
      <LandingHeader showAnchors={false} />
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-16">
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{t("pricing.title")}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t("pricing.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((key) => {
            const Icon = PLAN_ICONS[key];
            const features = t(`pricing.plans.${key}.features`, { returnObjects: true }) as string[];
            return (
              <div key={key} className="relative rounded-2xl border border-border bg-card p-8 shadow-card flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold">{t(`pricing.plans.${key}.title`)}</h2>
                </div>
                <p className="text-muted-foreground mb-6">{t(`pricing.plans.${key}.description`)}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{t(`pricing.plans.${key}.price`)}</span>
                  <span className="text-muted-foreground ml-2">{t(`pricing.plans.${key}.period`)}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button size="lg" className="w-full" onClick={() => setSelected(key)}>
                  {t(`pricing.plans.${key}.cta`)} <ArrowRight className="ml-1 w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center mt-10 text-sm text-muted-foreground">
          {t("pricing.alreadyClient")} <Link to="/login" className="text-primary underline">{t("pricing.loginLink")}</Link>
        </p>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pricing.form.title", { plan: selected ? t(`pricing.plans.${selected}.title`) : "" })}</DialogTitle>
            <DialogDescription>{t("pricing.form.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="name">{t("pricing.form.name")} *</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="email">{t("pricing.form.email")} *</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="company">{t("pricing.form.company")}</Label>
                <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="phone">{t("pricing.form.phone")}</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="headcount">{t("pricing.form.headcount")}</Label>
              <Input id="headcount" type="number" min={1} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="message">{t("pricing.form.message")}</Label>
              <Textarea id="message" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("pricing.form.submitting") : t("pricing.form.submit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pricing;
