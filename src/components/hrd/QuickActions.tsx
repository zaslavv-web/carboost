import { useNavigate } from "react-router-dom";
import { UserPlus, MessageSquarePlus, Megaphone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { icon: UserPlus,          label: "Пригласить сотрудника", to: "/invitations" },
  { icon: MessageSquarePlus, label: "Создать опрос",          to: "/pulse-surveys" },
  { icon: Megaphone,         label: "Объявление",             to: "/feed" },
  { icon: Search,            label: "Найти сотрудника",       to: "/users" },
];

const QuickActions = () => {
  const navigate = useNavigate();
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Быстрые действия</div>
      <div className="flex flex-col gap-1.5">
        {ACTIONS.map((a) => (
          <Button
            key={a.label}
            variant="ghost"
            className="justify-start h-9"
            onClick={() => navigate(a.to)}
          >
            <a.icon className="w-4 h-4 mr-2 text-muted-foreground" />
            <span className="text-[13px]">{a.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
