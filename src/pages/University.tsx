import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { useUserProfile, usePrimaryRole } from "@/hooks/useUserProfile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, Plus, Clock, Award, Lock, PlayCircle, Pencil } from "lucide-react";

interface Course {
  id: string; title: string; description: string | null;
  cover_url: string | null; level: string; duration_min: number;
  status: string; mandatory: boolean; updated_at: string;
}
interface Enrollment {
  id: string; course_id: string; course_title: string;
  cover_url: string | null; duration_min: number;
  status: string; due_at: string | null; mandatory: boolean;
  progress_total: number; progress_done: number; progress_pct: number;
  certificate_id: string | null;
}

const levelLabel: Record<string, string> = {
  beginner: "Начинающий", intermediate: "Средний", advanced: "Продвинутый",
};
const statusLabel: Record<string, string> = {
  not_started: "Не начат", in_progress: "В процессе", completed: "Завершён", failed: "Провален",
};
const statusVariant: Record<string, any> = {
  not_started: "secondary", in_progress: "default", completed: "outline", failed: "destructive",
};

export default function University() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();
  const canAuthor = ["hrd", "company_admin", "superadmin"].includes(role);
  const [search, setSearch] = useState("");

  const { data: catalog } = useQuery({
    queryKey: ["uni-courses"],
    queryFn: async () => (await laravel.get<{ courses: Course[] }>("/university/courses")).data!,
  });
  const { data: mine } = useQuery({
    queryKey: ["uni-mine"],
    queryFn: async () => (await laravel.get<{ enrollments: Enrollment[] }>("/university/my-enrollments")).data!,
  });
  const { data: blockers } = useQuery({
    queryKey: ["uni-blockers"],
    queryFn: async () => (await laravel.get<{ blockers: any[] }>("/university/blockers")).data!,
  });

  const enrollMut = useMutation({
    mutationFn: async (courseId: string) =>
      (await laravel.post("/university/enrollments", { course_id: courseId })).data,
    onSuccess: () => {
      toast.success("Вы записаны на курс");
      qc.invalidateQueries({ queryKey: ["uni-mine"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось записаться"),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      (await laravel.post<{ id: string }>("/university/courses", { title: "Новый курс" })).data!,
    onSuccess: (d) => {
      toast.success("Курс создан");
      qc.invalidateQueries({ queryKey: ["uni-catalog"] });
      navigate(`/university/${d.id}/edit`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось создать курс"),
  });

  const courses = (catalog?.courses ?? []).filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const enrolledIds = new Set((mine?.enrollments ?? []).map((e) => e.course_id));

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" /> Корпоративный университет
          </h1>
          <p className="text-sm text-muted-foreground">Курсы и обучение для сотрудников компании</p>
        </div>
        {canAuthor && (
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            <Plus className="w-4 h-4 mr-2" /> Создать курс
          </Button>
        )}
      </div>

      {(blockers?.blockers?.length ?? 0) > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <Lock className="w-4 h-4" /> Доступ к платформе ограничен
            </CardTitle>
            <CardDescription>
              У вас есть просроченные обязательные курсы. Завершите их, чтобы продолжить работу с остальными модулями.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blockers!.blockers.map((b: any) => (
              <div key={b.id} className="flex justify-between items-center text-sm">
                <span>{b.title}</span>
                <Button size="sm" variant="outline" onClick={() => navigate(`/university/${b.course_id}`)}>
                  Открыть
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Каталог</TabsTrigger>
          <TabsTrigger value="mine">Моё обучение {mine?.enrollments?.length ? `(${mine.enrollments.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <Input
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Card key={c.id} className="overflow-hidden flex flex-col">
                {c.cover_url ? (
                  <img src={c.cover_url} alt={c.title} className="h-32 w-full object-cover" />
                ) : (
                  <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <GraduationCap className="w-10 h-10 text-primary/40" />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    {c.status === "draft" && <Badge variant="secondary">Черновик</Badge>}
                    {c.mandatory && <Badge variant="destructive">Обязат.</Badge>}
                  </div>
                  <CardDescription className="line-clamp-2">{c.description ?? "—"}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-end space-y-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{levelLabel[c.level] ?? c.level}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {c.duration_min} мин</span>
                  </div>
                  <div className="flex gap-2">
                    {enrolledIds.has(c.id) ? (
                      <Button size="sm" className="flex-1" onClick={() => navigate(`/university/${c.id}`)}>
                        <PlayCircle className="w-4 h-4 mr-1" /> Продолжить
                      </Button>
                    ) : (
                      <Button size="sm" className="flex-1" onClick={() => enrollMut.mutate(c.id)} disabled={c.status !== "published"}>
                        Записаться
                      </Button>
                    )}
                    {canAuthor && (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/university/${c.id}/edit`)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {courses.length === 0 && (
              <Card className="col-span-full"><CardContent className="p-8 text-center text-muted-foreground">Курсов пока нет</CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mine" className="space-y-4">
          {(mine?.enrollments ?? []).map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{e.course_title}</h3>
                    <Badge variant={statusVariant[e.status]}>{statusLabel[e.status]}</Badge>
                    {e.mandatory && <Badge variant="destructive">Обязат.</Badge>}
                  </div>
                  <Progress value={e.progress_pct} className="mt-2 h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {e.progress_done}/{e.progress_total} уроков
                    {e.due_at && ` · до ${new Date(e.due_at).toLocaleDateString("ru")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {e.certificate_id && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/university/cert/${e.certificate_id}`)}>
                      <Award className="w-4 h-4 mr-1" /> Сертификат
                    </Button>
                  )}
                  <Button size="sm" onClick={() => navigate(`/university/${e.course_id}`)}>
                    Открыть
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(mine?.enrollments ?? []).length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Вы пока не записаны ни на один курс</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
