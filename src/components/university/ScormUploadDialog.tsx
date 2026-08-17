import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { laravel } from "@/integrations/laravel/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileArchive, Loader2, CheckCircle2 } from "lucide-react";

export function ScormUploadDialog({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const uploadMut = useMutation({
    mutationFn: async (formData: FormData) => {
      const uploadRes = await laravel.post<{ upload_token: string; package_path: string; manifest_path: string }>(
        "/university/scorm/upload",
        formData
      );
      if (uploadRes.error || !uploadRes.data?.upload_token) {
        throw new Error(uploadRes.error?.message || "Не удалось загрузить SCORM-пакет");
      }
      const importRes = await laravel.post<{ course_id: string; title: string }>("/university/scorm/import", {
        upload_token: uploadRes.data.upload_token,
        title: title || undefined,
        description: description || undefined,
      });
      if (importRes.error || !importRes.data?.course_id) {
        throw new Error(importRes.error?.message || "Не удалось импортировать SCORM-пакет");
      }
      return importRes.data;
    },
    onSuccess: (data) => {
      toast.success(`SCORM-курс «${data.title}» импортирован`);
      setOpen(false);
      setFile(null);
      setTitle("");
      setDescription("");
      navigate(`/university/${data.course_id}/edit`);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Не удалось импортировать SCORM");
    },
  });

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".zip")) setFile(f);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    uploadMut.mutate(fd);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-primary" /> Загрузить SCORM-пакет
          </DialogTitle>
          <DialogDescription>
            ZIP-архив с imsmanifest.xml (SCORM 1.2 или 2004). Максимум 100 МБ.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("scorm-file-input")?.click()}
          >
            <input
              id="scorm-file-input"
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-success" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} МБ</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Перетащите ZIP или нажмите для выбора</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scorm-title">Название курса (опционально)</Label>
            <Input
              id="scorm-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Берётся из imsmanifest.xml"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scorm-desc">Описание (опционально)</Label>
            <textarea
              id="scorm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание курса"
              className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploadMut.isPending}>
              Отмена
            </Button>
            <Button type="submit" disabled={!file || uploadMut.isPending}>
              {uploadMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Импорт…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" /> Импортировать
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
