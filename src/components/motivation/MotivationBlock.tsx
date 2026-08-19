import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ArrowUpRight, ArrowDownRight, Send, Sparkles, ShoppingBag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { useCurrencyOverview, useMyTransactions, formatCoins } from "@/hooks/useCurrency";
import TransferCoinsDialog from "./TransferCoinsDialog";

/**
 * Единый блок мотивации: баланс внутренней валюты, последние операции,
 * переход в магазин, перевод коллеге и витрина «как заработать».
 * Показывается на дашбордах всех ролей (не только сотрудника).
 */
const MotivationBlock = ({ className = "" }: { className?: string }) => {
  const navigate = useNavigate();
  const [transferOpen, setTransferOpen] = useState(false);
  const { data: overview } = useCurrencyOverview();
  const { data: tx = [] } = useMyTransactions(3);

  const balance = overview?.balance ?? 0;
  const icon = overview?.settings.currency_icon ?? "🪙";
  const name = overview?.settings.currency_name ?? "Монеты";
  const transfersEnabled = overview?.settings.transfers_enabled ?? true;

  return (
    <div className={`bg-card rounded-xl border border-border shadow-card p-5 space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Coins className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="text-2xl font-bold text-foreground leading-tight">
              {icon} {formatCoins(balance)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate("/shop")}
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs hover:border-primary/40 hover:bg-accent/40 transition-colors"
        >
          <ShoppingBag className="w-4 h-4 text-primary" />
          Магазин
        </button>
        <button
          onClick={() => setTransferOpen(true)}
          disabled={!transfersEnabled}
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs hover:border-primary/40 hover:bg-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4 text-primary" />
          Передать
        </button>
        <button
          onClick={() => navigate("/motivation/earn")}
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs hover:border-primary/40 hover:bg-accent/40 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          Как заработать
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Последние операции</p>
        {tx.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Операций пока нет</p>
        ) : (
          tx.map((item) => {
            const positive = item.amount > 0;
            return (
              <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                      positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  </div>
                  <span className="text-foreground truncate">{item.description || item.kind}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${positive ? "text-success" : "text-destructive"}`}>
                    {positive ? "+" : ""}
                    {formatCoins(item.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: getDateLocale() })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <TransferCoinsDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
};

export default MotivationBlock;
