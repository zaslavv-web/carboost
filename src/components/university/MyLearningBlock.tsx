import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, ChevronRight } from "lucide-react";

export interface MyEnrollment {
  id: string; course_id: string; course_title: string;
  status: string; due_at: string | null; mandatory: boolean;
  progress_total: number; progress_done: number; progress_pct: number;
}

export function useMyEnrollments() {
  return useQuery({
    queryKey: ["uni-mine"],
    queryFn: async () =>
      (await laravel.get<{ enrollments: MyEnrollment[] }>("/university/my-enrollments")).data!,
  });
}

/** Назначенное обучение сотрудника — курсы, на которые его записали. */
export function MyLearningBlock({ limit = 3 }: { limit?: number }) {
  const navigate = useNavigate();
  const { data } = useMyEnrollments();
  const all = data?.enrollments ?? [];
  const active = all.filter((e) => e.status !== "completed");
  const list = (active.length ? active : all).slice(0, limit);

  if (!all.length) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" /> Моё обучение
          {active.length > 0 && <Badge variant="secondary">{active.length}</Badge>}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => navigate("/university?tab=mine")}>
          Все курсы <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      <div className="space-y-2">
        {list.map((e) => {
          const overdue = !!e.due_at && new Date(e.due_at) < new Date() && e.status !== "completed";
          return (
            <Card key={e.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{e.course_title}</span>
                    {e.mandatory && <Badge variant="destructive">Обязат.</Badge>}
                    {overdue && <Badge variant="destructive">Просрочен</Badge>}
                  </div>
                  <Progress value={e.progress_pct} className="mt-2 h-1.5" />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {e.progress_done}/{e.progress_total} уроков
                    {e.due_at && ` · до ${new Date(e.due_at).toLocaleDateString("ru")}`}
                  </p>
                </div>
                <Button size="sm" onClick={() => navigate(`/university/${e.course_id}`)}>
                  {e.progress_done > 0 ? "Продолжить" : "Начать"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
