import { Link } from "react-router-dom";
import { Users, Mail, ClipboardList, GraduationCap, Route as RouteIcon, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import MotivationBlock from "@/components/motivation/MotivationBlock";

/**
 * Упрощённый дашборд для роли HR (подчинение HRD, тот же уровень доступа).
 * Фокус на операционных задачах: люди, приглашения, обучение, опросы.
 * Стратегическая аналитика и настройки компании доступны на страницах HRD,
 * но не показываются на главном экране, чтобы не перегружать интерфейс.
 */
const HrDashboard = () => {
  const { t } = useTranslation("common");

  const tiles: Array<{
    to: string;
    icon: JSX.Element;
    title: string;
    hint: string;
  }> = [
    {
      to: "/dashboard/invitations",
      icon: <Mail className="h-5 w-5" />,
      title: "Приглашения",
      hint: "Пригласить и подтвердить сотрудников",
    },
    {
      to: "/users",
      icon: <Users className="h-5 w-5" />,
      title: "Сотрудники",
      hint: "Профили, роли, должности",
    },
    {
      to: "/positions",
      icon: <RouteIcon className="h-5 w-5" />,
      title: "Должности и треки",
      hint: "Оргструктура и карьерные маршруты",
    },
    {
      to: "/university",
      icon: <GraduationCap className="h-5 w-5" />,
      title: "Обучение",
      hint: "Курсы, назначения, прогресс",
    },
    {
      to: "/pulse-surveys",
      icon: <ClipboardList className="h-5 w-5" />,
      title: "Опросы",
      hint: "Pulse-опросы и таргетинг",
    },
    {
      to: "/chat",
      icon: <MessageSquare className="h-5 w-5" />,
      title: "Чаты",
      hint: "Обращения сотрудников",
    },
  ];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Рабочее место HR
        </p>
        <h1 className="text-2xl font-semibold">Сегодня</h1>
        <p className="text-sm text-muted-foreground">
          Операционные задачи HR-специалиста. Стратегическая аналитика — у HRD.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                {tile.icon}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-foreground group-hover:text-primary">
                  {tile.title}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        {t("common:role", { defaultValue: "Роль" })}: HR-специалист · подчинение HRD
      </p>
    </div>
  );
};

export default HrDashboard;
