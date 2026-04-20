import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: string;
}

const DemoRequestDialog = ({ open, onOpenChange, source }: Props) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("demo_requests").insert({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || null,
        headcount: headcount ? Number(headcount) : null,
        source: source || "landing",
      });
      if (error) throw error;
      toast.success("Спасибо! Мы свяжемся с вами в течение рабочего дня.");
      setName(""); setEmail(""); setCompany(""); setHeadcount("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Не удалось отправить заявку");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Запросить демо</DialogTitle>
          <DialogDescription>
            Покажем платформу под задачи вашей компании. Без обязательств.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Рабочий email"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Компания"
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder="Размер команды (человек)"
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Отправить заявку
          </button>
          <p className="text-xs text-muted-foreground text-center">
            Нажимая кнопку, вы соглашаетесь на обработку персональных данных.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DemoRequestDialog;
