import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCurrencyRecipients,
  useCurrencyOverview,
  useTransferCoins,
  formatCoins,
} from "@/hooks/useCurrency";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

/** Передача внутренней валюты коллеге внутри компании. */
const TransferCoinsDialog = ({ open, onOpenChange }: Props) => {
  const [search, setSearch] = useState("");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const { data: overview } = useCurrencyOverview();
  const { data: people = [], isLoading } = useCurrencyRecipients(search);
  const transfer = useTransferCoins();

  const balance = overview?.balance ?? 0;
  const icon = overview?.settings.currency_icon ?? "🪙";
  const limit = overview?.settings.transfer_limit_per_day ?? 0;
  const spent = overview?.spent_today ?? 0;

  const reset = () => {
    setSearch("");
    setRecipient(null);
    setAmount("");
    setMessage("");
  };

  const submit = () => {
    const value = Number(amount);
    if (!recipient) return toast.error("Выберите получателя");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Укажите сумму больше нуля");
    if (value > balance) return toast.error("Недостаточно средств на балансе");

    transfer.mutate(
      { recipient_id: recipient, amount: Math.floor(value), message: message.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Перевод выполнен");
          reset();
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message || "Не удалось выполнить перевод"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Передать коллеге</DialogTitle>
          <DialogDescription>
            Баланс: {icon} {formatCoins(balance)}
            {limit > 0 ? ` · сегодня переведено ${formatCoins(spent)} из ${formatCoins(limit)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск коллеги"
              className="pl-9"
            />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : people.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Коллеги не найдены</p>
            ) : (
              people.map((p) => (
                <button
                  key={p.user_id}
                  type="button"
                  onClick={() => setRecipient(p.user_id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    recipient === p.user_id ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                  }`}
                >
                  <span className="font-medium">{p.full_name}</span>
                  {p.position && (
                    <span className="block text-xs text-muted-foreground">{p.position}</span>
                  )}
                </button>
              ))
            )}
          </div>

          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Сумма"
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="За что переводите? (необязательно)"
            rows={2}
          />

          <Button onClick={submit} disabled={transfer.isPending} className="w-full">
            {transfer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Перевести
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferCoinsDialog;
