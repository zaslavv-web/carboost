import { useState } from "react";
import { Check, Clock, AlertCircle, ChevronDown, ChevronRight, Target } from "lucide-react";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  deadline?: string;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  status: "completed" | "in_progress" | "at_risk";
  progress: number;
  deadline: string;
  checklist: ChecklistItem[];
}

const initialGoals: Goal[] = [
  {
    id: "1",
    title: "Сертификация Cloud Architect",
    description: "Получить сертификат AWS/GCP Solutions Architect Professional",
    status: "in_progress",
    progress: 75,
    deadline: "30.06.2026",
    checklist: [
      { id: "1a", text: "Пройти курс по Cloud Architecture", done: true },
      { id: "1b", text: "Завершить практические лабораторные", done: true },
      { id: "1c", text: "Сдать пробный экзамен", done: true, deadline: "15.04.2026" },
      { id: "1d", text: "Сдать финальный экзамен", done: false, deadline: "30.06.2026" },
    ],
  },
  {
    id: "2",
    title: "Развить навыки лидерства",
    description: "Провести как минимум 2 кросс-функциональных проекта",
    status: "in_progress",
    progress: 50,
    deadline: "31.08.2026",
    checklist: [
      { id: "2a", text: "Пройти тренинг по управлению командой", done: true },
      { id: "2b", text: "Стать наставником для junior-разработчика", done: true },
      { id: "2c", text: "Возглавить проект «Бета»", done: false, deadline: "30.05.2026" },
      { id: "2d", text: "Получить обратную связь от команды", done: false, deadline: "31.08.2026" },
    ],
  },
  {
    id: "3",
    title: "Улучшить публичные выступления",
    description: "Выступить на 3 внутренних и 1 внешней конференции",
    status: "at_risk",
    progress: 25,
    deadline: "15.05.2026",
    checklist: [
      { id: "3a", text: "Подготовить презентацию по архитектуре", done: true },
      { id: "3b", text: "Выступить на внутреннем митапе", done: false, deadline: "20.04.2026" },
      { id: "3c", text: "Подать заявку на конференцию", done: false, deadline: "01.05.2026" },
      { id: "3d", text: "Провести вебинар для команды", done: false, deadline: "15.05.2026" },
    ],
  },
  {
    id: "4",
    title: "Освоить System Design",
    description: "Изучить паттерны проектирования распределённых систем",
    status: "completed",
    progress: 100,
    deadline: "28.02.2026",
    checklist: [
      { id: "4a", text: "Прочитать «Designing Data-Intensive Applications»", done: true },
      { id: "4b", text: "Решить 20 задач по System Design", done: true },
      { id: "4c", text: "Провести ревью архитектуры проекта", done: true },
    ],
  },
];

const statusConfig = {
  completed: { label: "Завершено", color: "bg-success", textColor: "text-success", icon: Check },
  in_progress: { label: "В процессе", color: "bg-info", textColor: "text-info", icon: Clock },
  at_risk: { label: "Под угрозой", color: "bg-destructive", textColor: "text-destructive", icon: AlertCircle },
};

const CareerTrack = () => {
  const [goals, setGoals] = useState(initialGoals);
  const [expandedGoal, setExpandedGoal] = useState<string | null>("1");

  const toggleItem = (goalId: string, itemId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              checklist: g.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
              progress: Math.round(
                (g.checklist.filter((c) => (c.id === itemId ? !c.done : c.done)).length / g.checklist.length) * 100
              ),
            }
          : g
      )
    );
  };

  const totalProgress = Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / goals.length);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Мой карьерный трек</h1>
        <p className="text-muted-foreground text-sm mt-1">Ваш персональный план развития</p>
      </div>

      {/* Overall progress */}
      <div className="bg-card rounded-xl p-6 shadow-card border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <Target className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Общий прогресс</h3>
              <p className="text-sm text-muted-foreground">{goals.filter((g) => g.status === "completed").length} из {goals.length} целей завершено</p>
            </div>
          </div>
          <span className="text-2xl font-bold text-foreground">{totalProgress}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3">
          <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${totalProgress}%` }} />
        </div>
      </div>

      {/* Goals */}
      <div className="space-y-4">
        {goals.map((goal) => {
          const config = statusConfig[goal.status];
          const isExpanded = expandedGoal === goal.id;
          return (
            <div key={goal.id} className="bg-card rounded-xl shadow-card border border-border overflow-hidden animate-fade-in">
              <button
                onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                className="w-full p-5 flex items-center gap-4 text-left hover:bg-secondary/30 transition-colors"
              >
                <div className={`w-3 h-3 rounded-full ${config.color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-foreground ${goal.status === "completed" ? "line-through opacity-60" : ""}`}>
                      {goal.title}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.textColor} bg-accent`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{goal.description}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{goal.progress}%</p>
                    <p className="text-xs text-muted-foreground">до {goal.deadline}</p>
                  </div>
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/50">
                  <div className="w-full bg-muted rounded-full h-1.5 mt-4 mb-4">
                    <div className={`h-1.5 rounded-full transition-all ${config.color}`} style={{ width: `${goal.progress}%` }} />
                  </div>
                  <div className="space-y-2">
                    {goal.checklist.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer group"
                      >
                        <button
                          onClick={(e) => { e.preventDefault(); toggleItem(goal.id, item.id); }}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            item.done ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                          }`}
                        >
                          {item.done && <Check className="w-3 h-3 text-primary-foreground" />}
                        </button>
                        <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.text}
                        </span>
                        {item.deadline && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {item.deadline}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CareerTrack;
