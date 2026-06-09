import { useState } from "react";
import { useTranslation } from "react-i18next";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: string;
}

const DemoRequestDialog = ({ open, onOpenChange, source }: Props) => {
  const { t } = useTranslation("landing");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await laravelRpc("submit_demo_request", {
        _name: name.trim(),
        _email: email.trim(),
        _company: company.trim() || null,
        _headcount: headcount ? Number(headcount) : null,
        _source: source || "landing",
      });
      if (error) throw error;
      toast.success(t("demoDialog.success"));
      setName(""); setEmail(""); setCompany(""); setHeadcount("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || t("demoDialog.errorFallback"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("demoDialog.title")}</DialogTitle>
          <DialogDescription>{t("demoDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("demoDialog.name")}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("demoDialog.email")}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("demoDialog.company")}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder={t("demoDialog.headcount")}
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("demoDialog.submit")}
          </button>
          <p className="text-xs text-muted-foreground text-center">{t("demoDialog.consent")}</p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DemoRequestDialog;
