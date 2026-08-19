import { useNavigate } from "react-router-dom";
import { ArrowLeft, Award, Coins, Loader2, ShoppingBag, Send, Heart } from "lucide-react";
import { useEarnRules, useCurrencyOverview, formatCoins } from "@/hooks/useCurrency";

/** Витрина «Как заработать валюту»: активные правила награждения компании. */
const EarnCoins = () => {
  const navigate = useNavigate();
  const { data: overview } = useCurrencyOverview();
  const { data: rules = [], isLoading } = useEarnRules();

  const icon = overview?.settings.currency_icon ?? "🪙";
  const name = overview?.settings.currency_name ?? "Монеты";

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Как заработать {name.toLowerCase()}</h1>
        <p className="text-sm text-muted-foreground">
          Ваш баланс: {icon} {formatCoins(overview?.balance ?? 0)}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Способы заработать
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Правила начисления пока не настроены — обратитесь к HR.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-border bg-card p-4 flex gap-3">
                <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary h-fit">
                  <Award className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground">{rule.title}</h3>
                    <span className="text-sm font-semibold text-primary whitespace-nowrap">
                      +{formatCoins(rule.points)} {icon}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{rule.description}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {rule.trigger_mode === "auto" ? "Начисляется автоматически" : "Начисляет руководитель или HR"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Как потратить</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => navigate("/shop")}
            className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 transition-colors"
          >
            <ShoppingBag className="w-4 h-4 text-primary" />
            <p className="mt-2 text-sm font-medium">Магазин наград</p>
            <p className="text-xs text-muted-foreground">Обменять монеты на товары и привилегии</p>
          </button>
          <button
            onClick={() => navigate("/recognition")}
            className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 transition-colors"
          >
            <Heart className="w-4 h-4 text-primary" />
            <p className="mt-2 text-sm font-medium">Признания</p>
            <p className="text-xs text-muted-foreground">Поблагодарить коллегу публично</p>
          </button>
          <button
            onClick={() => navigate("/my-orders")}
            className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40 transition-colors"
          >
            <Coins className="w-4 h-4 text-primary" />
            <p className="mt-2 text-sm font-medium">Мои заказы</p>
            <p className="text-xs text-muted-foreground">История покупок и статусы выдачи</p>
          </button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5" /> Монеты можно передавать коллегам из блока мотивации на главной.
        </p>
      </section>
    </div>
  );
};

export default EarnCoins;
