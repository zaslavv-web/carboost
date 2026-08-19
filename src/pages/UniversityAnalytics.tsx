import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3, AlertTriangle, GraduationCap, Users, CheckCircle2 } from "lucide-react";

interface CourseRow {
  id: string; title: string; status: string; source_type: string | null; mandatory: boolean;
  assigned: number; completed: number; in_progress: number; overdue: number; completion_pct: number;
}
interface Overview {
  totals: { assigned: number; completed: number; in_progress: number; not_started: number; overdue: number; learners: number } | null;
  course_totals: { total: number; published: number; draft: number; scorm: number } | null;
  courses: CourseRow[];
  by_department: { department: string; assigned: number; completed: number; completion_pct: number }[];
}
interface LessonRow {
  id: string; title: string; type: string; module_title: string;
  touched: number; done: number; avg_score: number | null; avg_attempts: number | null;
  pass_pct: number; difficulty: number;
}
interface CourseDetail {
  course: { id: string; title: string; status: string; source_type: string | null };
  stats: { assigned: number; completed: number; in_progress: number; not_started: number; overdue: number };
  lessons_total: number;
  lessons: LessonRow[];
  laggards: {
    id: string; user_id: string; full_name: string | null; department: string | null;
    position: string | null; status: string; due_at: string | null; progress_pct: number; overdue: boolean;
  }[];
}

const Stat = ({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <Icon className="w-5 h-5 text-primary shrink-0" />
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </CardContent>
  </Card>
);

export default function UniversityAnalytics() {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState<string>("");

  const { data: ov, isLoading } = useQuery({
    queryKey: ["uni-analytics-overview"],
    queryFn: async () => (await laravel.get<Overview>("/university/analytics/overview")).data!,
  });

  const { data: detail } = useQuery({
    queryKey: ["uni-analytics-course", courseId],
    queryFn: async () => (await laravel.get<CourseDetail>(`/university/analytics/course/${courseId}`)).data!,
    enabled: !!courseId,
  });

  const t = ov?.totals;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2" onClick={() => navigate("/university")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> К каталогу
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Аналитика обучения
          </h1>
          <p className="text-sm text-muted-foreground">Назначения, прохождение и проблемные места курсов</p>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Загрузка…</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Назначено" value={t?.assigned ?? 0} icon={GraduationCap} />
        <Stat label="Учеников" value={t?.learners ?? 0} icon={Users} />
        <Stat label="Завершено" value={t?.completed ?? 0} icon={CheckCircle2} />
        <Stat label="В процессе" value={t?.in_progress ?? 0} icon={BarChart3} />
        <Stat label="Не начато" value={t?.not_started ?? 0} icon={BarChart3} />
        <Stat label="Просрочено" value={t?.overdue ?? 0} icon={AlertTriangle} />
      </div>

      <Tabs defaultValue="courses">
        <TabsList>
          <TabsTrigger value="courses">Курсы</TabsTrigger>
          <TabsTrigger value="departments">Отделы</TabsTrigger>
          <TabsTrigger value="detail">Разбор курса</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Прохождение по курсам</CardTitle>
              <CardDescription>
                Всего курсов: {ov?.course_totals?.total ?? 0} · опубликовано {ov?.course_totals?.published ?? 0} ·
                черновиков {ov?.course_totals?.draft ?? 0} · SCORM {ov?.course_totals?.scorm ?? 0}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(ov?.courses ?? []).map((c) => (
                <div key={c.id} className="space-y-1 border-b border-border/50 pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{c.title}</span>
                      {c.status !== "published" && <Badge variant="secondary">Черновик</Badge>}
                      {c.source_type === "scorm" && <Badge variant="outline">SCORM</Badge>}
                      {c.overdue > 0 && <Badge variant="destructive">Просрочено: {c.overdue}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{c.completed}/{c.assigned}</span>
                      <Button size="sm" variant="outline" onClick={() => setCourseId(c.id)}>Разбор</Button>
                    </div>
                  </div>
                  <Progress value={c.completion_pct} />
                </div>
              ))}
              {!ov?.courses?.length && <p className="text-sm text-muted-foreground">Пока нет назначенных курсов.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Завершаемость по отделам</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(ov?.by_department ?? []).map((d) => (
                <div key={d.department} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{d.department}</span>
                    <span className="text-muted-foreground">{d.completed}/{d.assigned} · {d.completion_pct}%</span>
                  </div>
                  <Progress value={d.completion_pct} />
                </div>
              ))}
              {!ov?.by_department?.length && <p className="text-sm text-muted-foreground">Нет данных.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail" className="space-y-4">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Выберите курс" /></SelectTrigger>
            <SelectContent>
              {(ov?.courses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {detail && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Сложные уроки</CardTitle>
                  <CardDescription>Индекс сложности учитывает долю незавершивших, средний балл и число попыток</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...detail.lessons].sort((a, b) => b.difficulty - a.difficulty).map((l) => (
                    <div key={l.id} className="space-y-1 border-b border-border/50 pb-3 last:border-0">
                      <div className="flex justify-between gap-2 text-sm flex-wrap">
                        <span className="truncate">
                          <span className="text-muted-foreground">{l.module_title} · </span>{l.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          прошли {l.pass_pct}% · балл {l.avg_score ?? "—"} · попыток {l.avg_attempts ?? "—"}
                        </span>
                      </div>
                      <Progress value={l.difficulty} />
                    </div>
                  ))}
                  {!detail.lessons.length && <p className="text-sm text-muted-foreground">В курсе нет уроков.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Отстающие ({detail.laggards.length})</CardTitle>
                  <CardDescription>Не завершили курс, уроков всего: {detail.lessons_total}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.laggards.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 text-sm flex-wrap">
                      <span className="truncate">
                        {u.full_name ?? u.user_id}
                        {u.department ? <span className="text-muted-foreground"> · {u.department}</span> : null}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {u.progress_pct}%
                        {u.overdue && <Badge variant="destructive">Просрочено</Badge>}
                      </span>
                    </div>
                  ))}
                  {!detail.laggards.length && <p className="text-sm text-muted-foreground">Все завершили курс.</p>}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
