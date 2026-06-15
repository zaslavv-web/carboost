import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowLeft, Save, GripVertical } from "lucide-react";

interface Lesson {
  id: string; module_id: string; order_index: number;
  type: "video" | "markdown" | "pdf" | "test";
  title: string; content: string | null;
  video_url: string | null; attachment_url: string | null;
  test_id: string | null; pass_score: number; duration_min: number;
}
interface Module { id: string; title: string; order_index: number; lessons: Lesson[]; }
interface Course {
  id: string; title: string; description: string | null;
  cover_url: string | null; level: string; duration_min: number;
  status: string; mandatory: boolean;
}

export default function CourseAuthoring() {
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

  const refetch = () => qc.invalidateQueries({ queryKey: ["uni-course", courseId] });

  const courseMut = useMutation({
    mutationFn: async (patch: Partial<Course>) =>
      (await laravel.patch(`/university/courses/${courseId}`, patch)).data,
    onSuccess: () => { toast.success("Сохранено"); refetch(); },
  });

  const addModule = useMutation({
    mutationFn: async () =>
      (await laravel.post(`/university/courses/${courseId}/modules`, { title: "Новый модуль" })).data,
    onSuccess: refetch,
  });
  const updModule = useMutation({
    mutationFn: async (v: { id: string; title: string }) =>
      (await laravel.patch(`/university/modules/${v.id}`, { title: v.title })).data,
    onSuccess: refetch,
  });
  const delModule = useMutation({
    mutationFn: async (id: string) => (await laravel.delete(`/university/modules/${id}`)).data,
    onSuccess: refetch,
  });

  const addLesson = useMutation({
    mutationFn: async (moduleId: string) =>
      (await laravel.post(`/university/modules/${moduleId}/lessons`, { title: "Новый урок", type: "markdown" })).data,
    onSuccess: refetch,
  });
  const updLesson = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Lesson> }) =>
      (await laravel.patch(`/university/lessons/${v.id}`, v.patch)).data,
    onSuccess: refetch,
  });
  const delLesson = useMutation({
    mutationFn: async (id: string) => (await laravel.delete(`/university/lessons/${id}`)).data,
    onSuccess: refetch,
  });

  const delCourse = useMutation({
    mutationFn: async () => (await laravel.delete(`/university/courses/${courseId}`)).data,
    onSuccess: () => navigate("/university"),
  });

  if (!data) return <div className="p-6">Загрузка…</div>;
  const course = data.course;
  const activeLesson = data.modules.flatMap((m) => m.lessons).find((l) => l.id === activeLessonId);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/university")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> К каталогу
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={course.status === "published" ? "default" : "secondary"}>
            {course.status === "published" ? "Опубликован" : course.status === "archived" ? "Архив" : "Черновик"}
          </Badge>
          {course.status !== "published" ? (
            <Button size="sm" onClick={() => courseMut.mutate({ status: "published" })}>Опубликовать</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => courseMut.mutate({ status: "draft" })}>В черновик</Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => confirm("Удалить курс?") && delCourse.mutate()}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Основное</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Название</Label>
            <Input defaultValue={course.title} onBlur={(e) => e.target.value !== course.title && courseMut.mutate({ title: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Описание</Label>
            <Textarea defaultValue={course.description ?? ""} rows={3} onBlur={(e) => courseMut.mutate({ description: e.target.value })} />
          </div>
          <div>
            <Label>Обложка (URL)</Label>
            <Input defaultValue={course.cover_url ?? ""} placeholder="https://…" onBlur={(e) => courseMut.mutate({ cover_url: e.target.value || null as any })} />
          </div>
          <div>
            <Label>Длительность (мин)</Label>
            <Input type="number" defaultValue={course.duration_min} onBlur={(e) => courseMut.mutate({ duration_min: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Уровень</Label>
            <Select defaultValue={course.level} onValueChange={(v) => courseMut.mutate({ level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Начинающий</SelectItem>
                <SelectItem value="intermediate">Средний</SelectItem>
                <SelectItem value="advanced">Продвинутый</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={course.mandatory} onCheckedChange={(v) => courseMut.mutate({ mandatory: v })} />
            <Label>Обязательный курс</Label>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Modules & lessons */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Структура</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addModule.mutate()}>
              <Plus className="w-4 h-4 mr-1" /> Модуль
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.modules.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <Input
                    defaultValue={m.title}
                    className="h-7 text-sm font-semibold"
                    onBlur={(e) => e.target.value !== m.title && updModule.mutate({ id: m.id, title: e.target.value })}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => confirm("Удалить модуль?") && delModule.mutate(m.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="pl-4 space-y-1">
                  {m.lessons.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setActiveLessonId(l.id)}
                      className={`w-full text-left text-sm px-2 py-1 rounded flex items-center justify-between ${
                        l.id === activeLessonId ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate">{l.title}</span>
                      <Badge variant="outline" className="text-[10px]">{l.type}</Badge>
                    </button>
                  ))}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => addLesson.mutate(m.id)}>
                    <Plus className="w-3 h-3 mr-1" /> Урок
                  </Button>
                </div>
              </div>
            ))}
            {data.modules.length === 0 && <p className="text-sm text-muted-foreground">Добавьте первый модуль</p>}
          </CardContent>
        </Card>

        {/* Lesson editor */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Редактор урока</CardTitle></CardHeader>
          <CardContent>
            {activeLesson ? (
              <LessonEditor
                key={activeLesson.id}
                lesson={activeLesson}
                onSave={(patch) => updLesson.mutate({ id: activeLesson.id, patch })}
                onDelete={() => { if (confirm("Удалить урок?")) { delLesson.mutate(activeLesson.id); setActiveLessonId(null); } }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Выберите урок слева</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LessonEditor({ lesson, onSave, onDelete }: { lesson: Lesson; onSave: (patch: Partial<Lesson>) => void; onDelete: () => void }) {
  const [form, setForm] = useState<Lesson>(lesson);
  const set = (k: keyof Lesson, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Label>Название</Label>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <Label>Тип</Label>
          <Select value={form.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="markdown">Текст (Markdown)</SelectItem>
              <SelectItem value="video">Видео (ссылка)</SelectItem>
              <SelectItem value="pdf">PDF (ссылка)</SelectItem>
              <SelectItem value="test">Тест</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {form.type === "video" && (
        <div>
          <Label>Ссылка на видео (YouTube / Vimeo / Kinescope)</Label>
          <Input value={form.video_url ?? ""} placeholder="https://youtube.com/watch?v=…" onChange={(e) => set("video_url", e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Видео хранятся во внешнем облаке — у нас только ссылка.</p>
        </div>
      )}
      {form.type === "pdf" && (
        <div>
          <Label>Ссылка на PDF</Label>
          <Input value={form.attachment_url ?? ""} placeholder="https://…" onChange={(e) => set("attachment_url", e.target.value)} />
        </div>
      )}
      {form.type === "test" && (
        <div>
          <Label>ID теста (из HRDTests)</Label>
          <Input value={form.test_id ?? ""} onChange={(e) => set("test_id", e.target.value)} />
        </div>
      )}

      <div>
        <Label>Описание / Содержание (Markdown)</Label>
        <Textarea rows={8} value={form.content ?? ""} onChange={(e) => set("content", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Длительность (мин)</Label>
          <Input type="number" value={form.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} />
        </div>
        <div>
          <Label>Проходной балл (%)</Label>
          <Input type="number" value={form.pass_score} onChange={(e) => set("pass_score", Number(e.target.value))} />
        </div>
      </div>

      <div className="flex justify-between pt-3 border-t">
        <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="w-4 h-4 mr-1" /> Удалить</Button>
        <Button onClick={() => onSave({
          title: form.title, type: form.type, content: form.content,
          video_url: form.video_url, attachment_url: form.attachment_url,
          test_id: form.test_id || null, pass_score: form.pass_score, duration_min: form.duration_min,
        })}><Save className="w-4 h-4 mr-1" /> Сохранить</Button>
      </div>
    </div>
  );
}
