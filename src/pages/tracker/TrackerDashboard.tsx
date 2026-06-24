import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrackerStats } from "@/hooks/tracker";
import { Target, ListChecks, AlertTriangle, CalendarClock, TrendingUp } from "lucide-react";

const Stat = ({ icon: Icon, label, value, hint, tone = "default" }: {
  icon: any; label: string; value: string | number; hint?: string;
  tone?: "default" | "danger" | "warning" | "success";
}) => {
  const toneCls = {
    default: "text-foreground",
    danger: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

const TrackerDashboard = () => {
  const s = useTrackerStats();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Target} label="Активные цели" value={s.activeGoals} hint={`всего: ${s.goalsCount}`} />
        <Stat icon={TrendingUp} label="Средний прогресс по OKR" value={`${s.avgProgress}%`} tone="success" />
        <Stat icon={ListChecks} label="Поручений" value={s.tasksCount} hint={`требуют внимания: ${s.needsAttention}`} />
        <Stat icon={AlertTriangle} label="Просрочено" value={s.overdueTasks} tone={s.overdueTasks > 0 ? "danger" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Ближайшие 1:1
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{s.upcomingMeetings}</p>
          <p className="text-sm text-muted-foreground mt-1">запланированных встреч</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">О модуле</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <p>
            Трекер собирает цели OKR, поручения и встречи 1:1 в единый контур руководителя.
            Каждое поручение можно связать с целью в один клик — на дашборде появится метрика
            «% поручений, привязанных к OKR».
          </p>
          <ul>
            <li><strong>Цели (OKR)</strong> — статусы: Черновик → Опубликовано → Требует пересмотра → Архив. Прогресс считается из ключевых результатов с учётом веса.</li>
            <li><strong>Поручения</strong> — матрица срочности (Критическая / Высокая / Средняя / Низкая) с разными порогами уведомлений и эскалаций.</li>
            <li><strong>1:1</strong> — повестка с пунктами, которые можно конвертировать в поручения.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrackerDashboard;
