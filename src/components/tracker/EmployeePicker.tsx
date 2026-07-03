import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravel } from "@/integrations/laravel/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmployeeOption {
  user_id: string;
  full_name: string | null;
  email?: string | null;
  position?: string | null;
  department?: string | null;
}

export function useEmployees() {
  return useQuery({
    queryKey: ["tracker.employees.v2"],
    queryFn: async () => {
      // Prefer richer Laravel REST endpoint (includes email) — fallback to laravelDb.
      try {
        const res = await laravel.get<any>(`/profiles?per_page=1000`);
        const items: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        if (items.length) {
          return items
            .map((p) => ({
              user_id: String(p.user_id),
              full_name: p.full_name ?? null,
              email: p.email ?? null,
              position: p.position ?? null,
              department: p.department ?? null,
            }))
            .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "ru")) as EmployeeOption[];
        }
      } catch {
        // fallthrough
      }
      const { data, error } = await laravelDb
        .from("profiles")
        .select("user_id, full_name, position, department")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []).map((p) => ({
        user_id: String(p.user_id),
        full_name: p.full_name ?? null,
        email: null,
        position: p.position ?? null,
        department: p.department ?? null,
      })) as EmployeeOption[];
    },
    staleTime: 60_000,
  });
}

interface EmployeePickerProps {
  value?: string | null;
  onChange: (userId: string) => void;
  placeholder?: string;
  className?: string;
  /** searchable combobox (по ФИО и e-mail). По умолчанию true. */
  searchable?: boolean;
  excludeIds?: string[];
}

export const EmployeePicker = ({
  value,
  onChange,
  placeholder = "Выберите сотрудника…",
  className,
  searchable = true,
  excludeIds,
}: EmployeePickerProps) => {
  const { data: employees = [], isLoading } = useEmployees();
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!excludeIds?.length) return employees;
    const set = new Set(excludeIds);
    return employees.filter((e) => !set.has(e.user_id));
  }, [employees, excludeIds]);

  const selected = filtered.find((e) => e.user_id === value);

  if (!searchable) {
    return (
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={isLoading ? "Загрузка…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((p) => (
            <SelectItem key={p.user_id} value={p.user_id}>
              {p.full_name || `ID ${p.user_id.slice(0, 8)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected
                ? selected.full_name || selected.email || selected.user_id.slice(0, 8)
                : isLoading
                ? "Загрузка…"
                : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command
          filter={(val, search) => {
            // val = user_id; ищем в подготовленном keywords через CommandItem `value`
            return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Поиск по имени, фамилии или e-mail…" />
          <CommandList>
            <CommandEmpty>Никого не найдено.</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => {
                const label = p.full_name || `ID ${p.user_id.slice(0, 8)}`;
                const keywords = [p.full_name, p.email, p.position, p.department, p.user_id]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();
                return (
                  <CommandItem
                    key={p.user_id}
                    value={keywords}
                    onSelect={() => {
                      onChange(p.user_id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === p.user_id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{label}</span>
                      {(p.email || p.position) && (
                        <span className="text-xs text-muted-foreground truncate">
                          {[p.email, p.position].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

/** Map user_id → full_name, удобно для отображения имён в списках. */
export function useEmployeeNameMap() {
  const { data: employees = [] } = useEmployees();
  return new Map(employees.map((p) => [p.user_id, p.full_name || ""]));
}
