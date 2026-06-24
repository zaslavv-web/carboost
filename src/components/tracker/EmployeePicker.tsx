import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Profile {
  user_id: string;
  full_name: string | null;
}

export function useEmployees() {
  return useQuery({
    queryKey: ["tracker.employees"],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data as Profile[]) ?? [];
    },
    staleTime: 60_000,
  });
}

interface EmployeePickerProps {
  value?: string | null;
  onChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
}

export const EmployeePicker = ({ value, onChange, placeholder = "Выберите сотрудника…", className }: EmployeePickerProps) => {
  const { data: employees = [], isLoading } = useEmployees();
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? "Загрузка…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {employees.map((p) => (
          <SelectItem key={p.user_id} value={String(p.user_id)}>
            {p.full_name || `ID ${String(p.user_id).slice(0, 8)}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Map user_id → full_name, удобно для отображения имён в списках. */
export function useEmployeeNameMap() {
  const { data: employees = [] } = useEmployees();
  return new Map(employees.map((p) => [String(p.user_id), p.full_name || ""]));
}
