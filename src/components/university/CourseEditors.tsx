import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X } from "lucide-react";

interface Person {
  user_id: string; full_name: string | null; email: string | null;
  department?: string | null; position?: string | null;
}

/** Управление доступом к редактированию курса: соавторы-редакторы. */
export function CourseEditors({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["uni-course-editors", courseId],
    queryFn: async () =>
      (await laravel.get<{ author_id: string | null; editors: Person[] }>(`/university/courses/${courseId}/editors`)).data!,
    enabled: !!courseId,
  });

  const { data: found } = useQuery({
    queryKey: ["uni-audience-search", search],
    queryFn: async () =>
      (await laravel.get<{ users: Person[] }>(`/university/audience/search?q=${encodeURIComponent(search)}`)).data!,
    enabled: search.trim().length > 1,
  });

  const save = useMutation({
    mutationFn: async (ids: string[]) =>
      (await laravel.put(`/university/courses/${courseId}/editors`, { editor_ids: ids })).data,
    onSuccess: () => {
      toast.success("Список редакторов обновлён");
      qc.invalidateQueries({ queryKey: ["uni-course-editors", courseId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить"),
  });

  const editors = data?.editors ?? [];
  const ids = editors.map((e) => e.user_id);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> Доступ к редактированию
        </CardTitle>
        <CardDescription>Кто, кроме автора и HR-ролей, может править этот курс</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {editors.map((e) => (
            <Badge key={e.user_id} variant="secondary" className="gap-1">
              {e.full_name ?? e.email ?? e.user_id}
              <button
                type="button"
                aria-label="Убрать редактора"
                onClick={() => save.mutate(ids.filter((i) => i !== e.user_id))}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {!editors.length && <span className="text-sm text-muted-foreground">Редакторы не назначены</span>}
        </div>

        <Input
          placeholder="Поиск сотрудника по имени или email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        {search.trim().length > 1 && (
          <div className="space-y-1 max-h-48 overflow-auto">
            {(found?.users ?? [])
              .filter((u) => !ids.includes(u.user_id))
              .slice(0, 20)
              .map((u) => (
                <div key={u.user_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {u.full_name ?? u.email}
                    {u.department ? <span className="text-muted-foreground"> · {u.department}</span> : null}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => save.mutate([...ids, u.user_id])}>
                    Добавить
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
