import { useNavigate } from "react-router-dom";
import { Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMyBalance, useMyTransactions, useCurrencySettings, formatCoins } from "@/hooks/useCurrency";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const CurrencyWidget = () => {
  const navigate = useNavigate();
  const { data: balance = 0 } = useMyBalance();
  const { data: settings } = useCurrencySettings();
  const { data: tx = [] } = useMyTransactions(3);

  const icon = settings?.currency_icon ?? "🪙";
  const name = settings?.currency_name ?? "Монеты";

  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between">
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
        <button
          onClick={() => navigate("/shop")}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          В магазин
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Последние операции</p>
        {tx.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Пока нет транзакций</p>
        ) : (
          tx.map((t) => {
            const positive = t.amount > 0;
            return (
              <div key={t.id} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                      positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  </div>
                  <span className="text-foreground truncate">{t.description || t.kind}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${positive ? "text-success" : "text-destructive"}`}>
                    {positive ? "+" : ""}
                    {formatCoins(t.amount)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CurrencyWidget;
