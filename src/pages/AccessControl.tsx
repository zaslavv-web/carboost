/**
 * Права доступа: матрица «роль × раздел» и история назначения ролей.
 *
 * Матрица хранится как переопределения дефолтов на бэкенде
 * (`/api/access-control/*`). Редактировать может только администратор
 * компании или суперадмин.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, RotateCcw, Save, Users } from "lucide-react";

type Flag = "can_view" | "can_edit" | "can_download";

interface MatrixRow {
  role: string;
  resource: string;
  can_view: boolean;
  can_edit: boolean;
  can_download: boolean;
  is_custom: boolean;
}

interface MatrixResponse {
  roles: string[];
  resources: { key: string; label: string; group: string }[];
  matrix: MatrixRow[];
  editable: boolean;
}

interface RoleChange {
  id: string;
  user_id: string;
  old_role: string | null;
  new_role: string;
  created_at: string;
  user_name: string | null;
  actor_name: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  employee: "Сотрудник",
  manager: "Руководитель",
  hr: "HR",
  hrd: "HRD",
  company_admin: "Администратор",
};

const FLAG_LABELS: { key: Flag; label: string; short: string }[] = [
  { key: "can_view", label: "Просмотр", short: "П" },
  { key: "can_edit", label: "Редактирование", short: "Р" },
  { key: "can_download", label: "Скачивание", short: "С" },
];

const keyOf = (role: string, resource: string) => `${role}|${resource}`;

export default function AccessControl() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Record<string, MatrixRow>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["access-control", "matrix"],
    queryFn: async () => {
      const { data, error } = await laravel.get<MatrixResponse>("/access-control/matrix");
      if (error) throw new Error(error.message);
      return data as MatrixResponse;
    },
  });

  const { data: changes = [], isLoading: changesLoading } = useQuery({
    queryKey: ["access-control", "role-changes"],
    queryFn: async () => {
      const { data, error } = await laravel.get<{ items: RoleChange[] }>("/access-control/role-changes");
      if (error) throw new Error(error.message);
      return data?.items ?? [];
    },
  });

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.matrix.map((r) => [keyOf(r.role, r.resource), r])));
  }, [data]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string }[]>();
    for (const r of data?.resources ?? []) {
      map.set(r.group, [...(map.get(r.group) ?? []), { key: r.key, label: r.label }]);
    }
    return [...map.entries()];
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return [] as MatrixRow[];
    return data.matrix.filter((orig) => {
      const cur = draft[keyOf(orig.role, orig.resource)];
      if (!cur) return false;
      return FLAG_LABELS.some((f) => cur[f.key] !== orig[f.key]);
    }).map((orig) => draft[keyOf(orig.role, orig.resource)]);
  }, [data, draft]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await laravel.post("/access-control/matrix", { items: dirty });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Права сохранены");
      qc.invalidateQueries({ queryKey: ["access-control"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить права"),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await laravel.post("/access-control/reset", {});
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Матрица сброшена к значениям по умолчанию");
      qc.invalidateQueries({ queryKey: ["access-control"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сбросить права"),
  });

  const editable = data?.editable ?? false;

  const toggle = (role: string, resource: string, flag: Flag, value: boolean) => {
    setDraft((prev) => {
      const cur = prev[keyOf(role, resource)];
      if (!cur) return prev;
      const next = { ...cur, [flag]: value };
      // Без просмотра нет ни редактирования, ни скачивания.
      if (flag === "can_view" && !value) {
        next.can_edit = false;
        next.can_download = false;
      }
      if ((flag === "can_edit" || flag === "can_download") && value) next.can_view = true;
      return { ...prev, [keyOf(role, resource)]: next };
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Права доступа
          </h1>
          <p className="text-sm text-muted-foreground">
            Настройте, какие разделы видят и редактируют роли, и следите за назначением ролей сотрудникам.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/users")}>
            <Users className="w-4 h-4 mr-2" /> Назначить роли
          </Button>
          {editable && (
            <>
              <Button variant="outline" size="sm" disabled={reset.isPending} onClick={() => reset.mutate()}>
                <RotateCcw className="w-4 h-4 mr-2" /> Сбросить
              </Button>
              <Button size="sm" disabled={!dirty.length || save.isPending} onClick={() => save.mutate()}>
                <Save className="w-4 h-4 mr-2" /> Сохранить{dirty.length ? ` (${dirty.length})` : ""}
              </Button>
            </>
          )}
        </div>
      </header>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Матрица прав</TabsTrigger>
          <TabsTrigger value="log">История ролей</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4 space-y-4">
          {isLoading && <Skeleton className="h-64 w-full" />}
          {!isLoading && groups.map(([group, items]) => (
            <Card key={group}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{group}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium py-2 pr-4">Раздел</th>
                      {(data?.roles ?? []).map((role) => (
                        <th key={role} className="font-medium px-2 py-2 text-center">
                          <div>{ROLE_LABELS[role] ?? role}</div>
                          <div className="text-[10px] font-normal">
                            {FLAG_LABELS.map((f) => f.short).join(" · ")}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((res) => (
                      <tr key={res.key} className="border-t border-border">
                        <td className="py-2 pr-4">{res.label}</td>
                        {(data?.roles ?? []).map((role) => {
                          const row = draft[keyOf(role, res.key)];
                          return (
                            <td key={role} className="px-2 py-2">
                              <div className="flex items-center justify-center gap-2">
                                {FLAG_LABELS.map((f) => (
                                  <Checkbox
                                    key={f.key}
                                    aria-label={`${ROLE_LABELS[role] ?? role} — ${res.label} — ${f.label}`}
                                    checked={!!row?.[f.key]}
                                    disabled={!editable}
                                    onCheckedChange={(v) => toggle(role, res.key, f.key, !!v)}
                                  />
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">
            П — просмотр раздела, Р — создание и изменение записей, С — выгрузка и скачивание файлов.
          </p>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">История назначения ролей</CardTitle>
            </CardHeader>
            <CardContent>
              {changesLoading && <Skeleton className="h-40 w-full" />}
              {!changesLoading && changes.length === 0 && (
                <p className="text-sm text-muted-foreground">Изменений ролей пока не было.</p>
              )}
              {!changesLoading && changes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-medium py-2 pr-4">Сотрудник</th>
                        <th className="text-left font-medium py-2 pr-4">Было</th>
                        <th className="text-left font-medium py-2 pr-4">Стало</th>
                        <th className="text-left font-medium py-2 pr-4">Кто изменил</th>
                        <th className="text-left font-medium py-2">Когда</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-2 pr-4">{c.user_name ?? c.user_id.slice(0, 8)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {c.old_role ? ROLE_LABELS[c.old_role] ?? c.old_role : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant="secondary">{ROLE_LABELS[c.new_role] ?? c.new_role}</Badge>
                          </td>
                          <td className="py-2 pr-4">{c.actor_name ?? "—"}</td>
                          <td className="py-2 text-muted-foreground">
                            {c.created_at ? new Date(c.created_at).toLocaleString("ru-RU") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
