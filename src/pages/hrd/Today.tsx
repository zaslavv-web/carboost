import { useHrdInbox } from "@/hooks/useHrdInbox";
import InboxCard from "@/components/hrd/inbox/InboxCard";
import KpiStrip from "@/components/hrd/KpiStrip";
import QuickActions from "@/components/hrd/QuickActions";
import WeekCalendar from "@/components/hrd/WeekCalendar";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Loader2, Inbox as InboxIcon } from "lucide-react";

const HrdToday = () => {
  const { data: profile } = useUserProfile();
  const { items, isLoading } = useHrdInbox();

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "HR";
  const hour = new Date().getHours();
  const greeting =
    hour < 6  ? "Доброй ночи" :
    hour < 12 ? "Доброе утро" :
    hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length === 0
              ? "Инбокс пуст — можно погрузиться в глубокую работу."
              : `${items.length} ${items.length === 1 ? "задача" : items.length < 5 ? "задачи" : "задач"} требуют вашего внимания сегодня.`}
          </p>
        </div>
      </header>

      <KpiStrip />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Инбокс</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-14 text-center">
              <InboxIcon className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">Никаких новых действий — всё под контролем.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => <InboxCard key={it.id} item={it} />)}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <WeekCalendar />
          <QuickActions />
        </aside>
      </div>
    </div>
  );
};

export default HrdToday;
