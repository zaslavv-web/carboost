import { KedoRouteStep, KEDO_ACTION_LABELS, KEDO_ACTOR_LABELS, KedoActorType, KedoAction } from "@/integrations/laravel/kedo";
import { useEmployees } from "@/components/tracker/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, GripVertical, Plus, Trash2 } from "lucide-react";

const ROLES = [
  { value: "hr", label: "HR" },
  { value: "hrd", label: "HRD" },
  { value: "company_admin", label: "Администратор компании" },
  { value: "manager", label: "Руководитель" },
];

interface RouteBuilderProps {
  steps: KedoRouteStep[];
  onChange: (steps: KedoRouteStep[]) => void;
}

/** Визуальный конструктор маршрута согласования и подписания (B2.4). */
export const RouteBuilder = ({ steps, onChange }: RouteBuilderProps) => {
  const { data: employees = [] } = useEmployees();

  const update = (index: number, patch: Partial<KedoRouteStep>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const remove = (index: number) => onChange(steps.filter((_, i) => i !== index));

  const move = (index: number, dir: -1 | 1) => {
    const next = [...steps];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () =>
    onChange([...steps, { actor_type: "subject", action: "sign", due_days: 3, title: "" }]);

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Шагов пока нет. Без маршрута документ подписывает сам сотрудник.
        </p>
      )}

      {steps.map((step, index) => (
        <div key={index} className="rounded-lg border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold shrink-0">Шаг {index + 1}</span>
            <Input
              value={step.title ?? ""}
              onChange={(e) => update(index, { title: e.target.value })}
              placeholder="Название шага (необязательно)"
              className="h-8"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => move(index, -1)} disabled={index === 0}>
              <ArrowDown className="h-4 w-4 rotate-180" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(index)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={step.actor_type} onValueChange={(v) => update(index, { actor_type: v as KedoActorType, actor_ref: null })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Участник" /></SelectTrigger>
              <SelectContent>
                {Object.entries(KEDO_ACTOR_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {step.actor_type === "user" ? (
              <Select value={step.actor_ref ?? ""} onValueChange={(v) => update(index, { actor_ref: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name || e.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : step.actor_type === "role" ? (
              <Select value={step.actor_ref ?? ""} onValueChange={(v) => update(index, { actor_ref: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Выберите роль" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center text-xs text-muted-foreground px-1">
                Участник определяется автоматически
              </div>
            )}

            <Select value={step.action} onValueChange={(v) => update(index, { action: v as KedoAction })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Действие" /></SelectTrigger>
              <SelectContent>
                {Object.entries(KEDO_ACTION_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={365}
                value={step.due_days ?? 3}
                onChange={(e) => update(index, { due_days: Number(e.target.value) })}
                className="h-9"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">дн. на шаг</span>
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Добавить шаг
      </Button>
    </div>
  );
};

export default RouteBuilder;
