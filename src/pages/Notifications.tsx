import { Bell, Check, Info, AlertTriangle, Award, Target, MessageSquare } from "lucide-react";

interface Notification {
  id: number;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: "info" | "success" | "warning" | "achievement";
}

const notifications: Notification[] = [
  { id: 1, title: "Дедлайн через 3 дня", description: "Задача «Сдать пробный экзамен» должна быть выполнена до 15.04.2026", time: "1 час назад", read: false, type: "warning" },
  { id: 2, title: "Новое достижение!", description: "Вы получили значок «Активный ученик» за прохождение 10 курсов", time: "3 часа назад", read: false, type: "achievement" },
  { id: 3, title: "Обновление карьерного трека", description: "Ваш руководитель добавил новую цель в ваш карьерный трек", time: "Вчера", read: false, type: "info" },
  { id: 4, title: "AI-оценка доступна", description: "Вы можете пройти повторную оценку компетенций", time: "2 дня назад", read: true, type: "info" },
  { id: 5, title: "Цель завершена!", description: "Поздравляем! Вы успешно завершили цель «Освоить System Design»", time: "3 дня назад", read: true, type: "success" },
  { id: 6, title: "Напоминание от наставника", description: "Запланируйте встречу с ментором на следующей неделе", time: "5 дней назад", read: true, type: "info" },
];

const typeConfig = {
  info: { icon: Info, color: "bg-info/10 text-info" },
  success: { icon: Check, color: "bg-success/10 text-success" },
  warning: { icon: AlertTriangle, color: "bg-warning/10 text-warning" },
  achievement: { icon: Award, color: "bg-primary/10 text-primary" },
};

const Notifications = () => {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Уведомления</h1>
          <p className="text-muted-foreground text-sm mt-1">{unread} непрочитанных</p>
        </div>
        <button className="text-sm text-primary hover:underline">Отметить все как прочитанные</button>
      </div>

      <div className="space-y-3">
        {notifications.map((n) => {
          const config = typeConfig[n.type];
          return (
            <div
              key={n.id}
              className={`bg-card rounded-xl p-4 shadow-card border transition-colors animate-fade-in ${
                n.read ? "border-border opacity-70" : "border-primary/20"
              }`}
            >
              <div className="flex gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                  <config.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">{n.time}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Notifications;
