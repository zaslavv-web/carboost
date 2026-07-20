import { useHrdInbox } from "@/hooks/useHrdInbox";
import { Calendar } from "lucide-react";

/**
 * Compact week overview. Iteration 1: shows just the upcoming leave dates
 * from the inbox — enough to give the HRD a sense of the week without
 * fetching a separate calendar source. Placeholder for future 1:1s / reviews.
 */
const WeekCalendar = () => {
  const { items } = useHrdInbox();
  const upcoming = items
    .filter((i) => i.kind === "leave" && i.dueAt)
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" /> Неделя
      </div>
      {upcoming.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">Событий на неделе нет.</div>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map((i) => (
            <li key={i.id} className="text-[12.5px] flex items-start gap-2">
              <span className="font-mono text-[10.5px] text-muted-foreground shrink-0 mt-0.5">
                {i.dueAt?.slice(5, 10)}
              </span>
              <span className="truncate">{i.title.replace(/^Отпуск:\s*/, "")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default WeekCalendar;
