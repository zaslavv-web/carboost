import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, PlayCircle, FileText, ClipboardList, ArrowLeft, Award } from "lucide-react";

interface Lesson {
  id: string; module_id: string; order_index: number;
  type: "video" | "markdown" | "pdf" | "test";
  title: string; content: string | null;
  video_url: string | null; attachment_url: string | null;
  test_id: string | null; pass_score: number; duration_min: number;
}
interface Module { id: string; title: string; order_index: number; lessons: Lesson[]; }
interface Course { id: string; title: string; description: string | null; level: string; status: string; }

const typeIcon = { video: PlayCircle, markdown: FileText, pdf: FileText, test: ClipboardList } as const;

function toEmbed(url: string): string {
  // YouTube watch -> embed
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

export default function CourseView() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["uni-course", courseId],
    queryFn: async () =>
      (await laravel.get<{ course: Course; modules: Module[] }>(`/university/courses/${courseId}`)).data!,
    enabled: !!courseId,
  });
  const { data: mine } = useQuery({
    queryKey: ["uni-mine"],
    queryFn: async () => (await laravel.get<{ enrollments: any[] }>("/university/my-enrollments")).data!,
  });

  const enrollment = useMemo(
    () => mine?.enrollments.find((e) => e.course_id === courseId),
    [mine, courseId]
  );

  const allLessons = useMemo(
    () => (data?.modules ?? []).flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTitle: m.title }))),
    [data]
  );
  useEffect(() => {
    if (!activeLessonId && allLessons[0]) setActiveLessonId(allLessons[0].id);
  }, [allLessons, activeLessonId]);

  // Progress map
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const enrollMut = useMutation({
    mutationFn: async () => (await laravel.post<{ id: string }>("/university/enrollments", { course_id: courseId })).data!,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uni-mine"] }),
  });

  const progressMut = useMutation({
    mutationFn: async (vars: { enrollmentId: string; lesson_id: string; completed?: boolean; score?: number }) => {
      const { enrollmentId, ...body } = vars;
      return (await laravel.post<{ completed: boolean; certificate_id: string | null }>(
        `/university/enrollments/${enrollmentId}/progress`, body
      )).data!;
    },
    onSuccess: (res, vars) => {
      setCompleted((s) => new Set(s).add(vars.lesson_id));
      qc.invalidateQueries({ queryKey: ["uni-mine"] });
      if (res.completed) {
        toast.success("Курс завершён! Сертификат выдан.");
      }
    },
  });

  const activeLesson = allLessons.find((l) => l.id === activeLessonId);
  const Icon = activeLesson ? typeIcon[activeLesson.type] : FileText;

  const handleComplete = async () => {
    if (!activeLesson) return;
    let enrollmentId = enrollment?.id;
    if (!enrollmentId) {
      const r = await enrollMut.mutateAsync();
      enrollmentId = r.id;
    }
    progressMut.mutate({ enrollmentId: enrollmentId!, lesson_id: activeLesson.id, completed: true });
  };

  const total = allLessons.length;
  const done = completed.size + (enrollment?.progress_done ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  if (!data) return <div className="p-6">Загрузка…</div>;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/university")} className="mb-3">
        <ArrowLeft className="w-4 h-4 mr-1" /> К каталогу
      </Button>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sidebar — modules/lessons */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{data.course.title}</CardTitle>
            <Progress value={pct} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground">{done}/{total} уроков</p>
            {enrollment?.certificate_id && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate(`/university/cert/${enrollment.certificate_id}`)}>
                <Award className="w-4 h-4 mr-1" /> Сертификат
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {data.modules.map((m) => (
              <div key={m.id}>
                <h4 className="text-sm font-semibold mb-1">{m.title}</h4>
                <div className="space-y-1">
                  {m.lessons.map((l) => {
                    const isDone = completed.has(l.id);
                    const LIcon = typeIcon[l.type];
                    return (
                      <button
                        key={l.id}
                        onClick={() => setActiveLessonId(l.id)}
                        className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-2 ${
                          l.id === activeLessonId ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                        <LIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{l.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {data.modules.length === 0 && <p className="text-sm text-muted-foreground">Модулей пока нет</p>}
          </CardContent>
        </Card>

        {/* Lesson body */}
        <Card className="lg:col-span-2">
          {activeLesson ? (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">{activeLesson.title}</CardTitle>
                  <Badge variant="secondary" className="ml-auto">{activeLesson.duration_min} мин</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeLesson.type === "video" && activeLesson.video_url && (
                  <div className="aspect-video w-full bg-black rounded overflow-hidden">
                    <iframe
                      src={toEmbed(activeLesson.video_url)}
                      className="w-full h-full"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      title={activeLesson.title}
                    />
                  </div>
                )}
                {activeLesson.type === "pdf" && activeLesson.attachment_url && (
                  <div className="space-y-2">
                    <Button asChild variant="outline">
                      <a href={activeLesson.attachment_url} target="_blank" rel="noreferrer">Открыть PDF</a>
                    </Button>
                    <iframe src={activeLesson.attachment_url} className="w-full h-[600px] rounded border" title={activeLesson.title} />
                  </div>
                )}
                {activeLesson.type === "test" && (
                  <div className="p-4 border rounded bg-muted/30">
                    <p className="text-sm mb-3">Пройдите проверочный тест, чтобы завершить урок.</p>
                    <Button onClick={() => navigate(`/tests?id=${activeLesson.test_id}`)} disabled={!activeLesson.test_id}>
                      Начать тест
                    </Button>
                  </div>
                )}
                {activeLesson.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{activeLesson.content}</ReactMarkdown>
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleComplete} disabled={progressMut.isPending || completed.has(activeLesson.id)}>
                    {completed.has(activeLesson.id) ? "Урок пройден" : "Отметить как пройденный"}
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="p-8 text-center text-muted-foreground">Выберите урок слева</CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
