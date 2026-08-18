import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeePicker } from "@/components/tracker/EmployeePicker";
import { Building2, Users, User, Network } from "lucide-react";

export type GoalScopeType = "employee" | "division" | "department" | "company";

export interface DepartmentRow {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: string | null;
}

export const GOAL_SCOPE_OPTIONS: { value: GoalScopeType; label: string }[] = [
  { value: "employee", label: "Сотрудник" },
  { value: "division", label: "Подразделение" },
  { value: "department", label: "Отдел" },
  { value: "company", label: "Компания" },
];

export function useDepartments() {
  return useQuery({
    queryKey: ["tracker.departments"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("departments")
        .select("id, name, parent_id, company_id")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []).map((d) => ({
        id: String(d.id),
        name: d.name ?? "",
        parent_id: d.parent_id ? String(d.parent_id) : null,
        company_id: d.company_id ? String(d.company_id) : null,
      })) as DepartmentRow[];
    },
  });
}

export function scopeIcon(type?: GoalScopeType | string | null) {
  if (type === "company") return Building2;
  if (type === "division") return Network;
  if (type === "department") return Users;
  return User;
}

export function scopeLabelText(type?: GoalScopeType | string | null, label?: string | null) {
  const base = GOAL_SCOPE_OPTIONS.find((o) => o.value === type)?.label ?? "Сотрудник";
  return label ? `${base}: ${label}` : base;
}

interface Props {
  scopeType: GoalScopeType;
  scopeRef: string | null;
  holderId: string | null;
  onChange: (v: { scopeType: GoalScopeType; scopeRef: string | null; scopeLabel: string | null; holderId: string | null }) => void;
}

export const GoalScopePicker = ({ scopeType, scopeRef, holderId, onChange }: Props) => {
  const { data: departments = [], isLoading } = useDepartments();

  const divisions = useMemo(() => departments.filter((d) => !d.parent_id), [departments]);
  const units = useMemo(() => departments.filter((d) => !!d.parent_id), [departments]);
  const list = scopeType === "division" ? divisions : units;

  const nameById = (id: string | null) => departments.find((d) => d.id === id)?.name ?? null;

  return (
    <div className="space-y-3">
      <div>
        <Label>Назначить на</Label>
        <Select
          value={scopeType}
          onValueChange={(v: GoalScopeType) =>
            onChange({ scopeType: v, scopeRef: null, scopeLabel: null, holderId: v === "employee" ? holderId : null })
          }
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GOAL_SCOPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {scopeType === "employee" && (
        <div>
          <Label>Сотрудник</Label>
          <EmployeePicker
            value={holderId}
            onChange={(id) => onChange({ scopeType, scopeRef: null, scopeLabel: null, holderId: id ?? null })}
          />
        </div>
      )}

      {(scopeType === "division" || scopeType === "department") && (
        <div>
          <Label>{scopeType === "division" ? "Подразделение" : "Отдел"}</Label>
          <Select
            value={scopeRef ?? ""}
            onValueChange={(v) => onChange({ scopeType, scopeRef: v, scopeLabel: nameById(v), holderId: null })}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? "Загрузка…" : "Выберите…"} />
            </SelectTrigger>
            <SelectContent>
              {list.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Нет данных в оргструктуре</div>}
              {list.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {scopeType === "department" && d.parent_id ? `${nameById(d.parent_id) ?? ""} / ${d.name}` : d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {scopeType === "company" && (
        <p className="text-sm text-muted-foreground">Цель будет общекорпоративной — видна всем сотрудникам компании.</p>
      )}
    </div>
  );
};
