import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  useTaskComments, useCreateComment, useUpdateComment, useDeleteComment,
  useTaskAttachments, useUploadAttachment, useDeleteAttachment, getAttachmentSignedUrl,
  useTaskActivity, useUpdateTask,
  type TrackerTask, type TrackerComment, type TrackerMention,
} from "@/hooks/tracker";
import { useEmployees, useEmployeeNameMap } from "@/components/tracker/EmployeePicker";
import { UrgencyBadge, TaskStatusBadge } from "@/components/tracker/Badges";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { Paperclip, Send, Trash2, Pencil, X, Check, Download, MessageSquare, Activity as ActivityIcon, AtSign } from "lucide-react";
import { toast } from "sonner";

const fmtSize = (n: number | null) => {
  if (!n) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
};

const renderBody = (body: string, mentions: TrackerMention[] | null) => {
  // Подсветка @имя — простая замена без HTML-инъекций.
  const names = (mentions ?? []).map((m) => m.name).filter(Boolean);
  const parts: (string | { mention: string })[] = [body];
  names.forEach((name) => {
    const next: typeof parts = [];
    parts.forEach((p) => {
      if (typeof p !== "string") return next.push(p);
      const tag = `@${name}`;
      let rest = p;
      while (rest.includes(tag)) {
        const i = rest.indexOf(tag);
        if (i > 0) next.push(rest.slice(0, i));
        next.push({ mention: tag });
        rest = rest.slice(i + tag.length);
      }
      if (rest) next.push(rest);
    });
    parts.splice(0, parts.length, ...next);
  });
  return parts.map((p, i) =>
    typeof p === "string"
      ? <span key={i}>{p}</span>
      : <span key={i} className="text-primary font-medium">{p.mention}</span>
  );
};

const CommentComposer = ({ taskId }: { taskId: string }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<TrackerMention[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const { data: employees = [] } = useEmployees();
  const create = useCreateComment();

  const submit = async () => {
    if (!body.trim()) return;
    // Оставляем только реально упомянутые в тексте.
    const actual = mentions.filter((m) => body.includes(`@${m.name}`));
    await create.mutateAsync({ task_id: taskId, body: body.trim(), mentions: actual });
    setBody(""); setMentions([]);
  };

  const insertMention = (m: { user_id: string; name: string }) => {
    const at = `@${m.name} `;
    const el = ref.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const next = body.slice(0, start) + at + body.slice(start);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + at.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setBody((b) => b + at);
    }
    setMentions((arr) => arr.some((x) => x.user_id === m.user_id) ? arr : [...arr, m]);
    setMentionOpen(false);
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref} rows={3}
        placeholder="Напишите комментарий… используйте @, чтобы упомянуть коллегу"
        value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
      />
      <div className="flex items-center gap-2">
        <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="gap-1.5">
              <AtSign className="w-3.5 h-3.5" />Упомянуть
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-72" align="start">
            <Command>
              <CommandInput placeholder="Имя сотрудника…" />
              <CommandList>
                <CommandEmpty>Никого не нашлось.</CommandEmpty>
                <CommandGroup>
                  {employees.map((p) => (
                    <CommandItem
                      key={p.user_id}
                      value={p.full_name || p.user_id}
                      onSelect={() => insertMention({ user_id: String(p.user_id), name: p.full_name || `id-${String(p.user_id).slice(0, 6)}` })}
                    >
                      {p.full_name || `ID ${String(p.user_id).slice(0, 8)}`}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter — отправить</span>
        <div className="flex-1" />
        <Button size="sm" onClick={submit} disabled={create.isPending || !body.trim()}>
          <Send className="w-3.5 h-3.5 mr-1.5" />Отправить
        </Button>
      </div>
    </div>
  );
};

const CommentItem = ({ comment, names, currentUserId }: { comment: TrackerComment; names: Map<string, string>; currentUserId: string | null }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const update = useUpdateComment();
  const del = useDeleteComment();
  const isMine = currentUserId != null && String(comment.author_id) === String(currentUserId);
  const author = names.get(String(comment.author_id)) || `ID ${String(comment.author_id).slice(0, 8)}`;

  return (
    <div className="rounded-md border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{author}</span>
        <span>·</span>
        <span title={format(new Date(comment.created_at), "dd.MM.yyyy HH:mm")}>
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ru })}
        </span>
        {comment.edited_at && <span className="italic">(изменено)</span>}
        {isMine && !editing && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => { setEditing(true); setDraft(comment.body); }} className="hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => del.mutate({ id: comment.id, task_id: comment.task_id })} className="hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
            <Button size="sm" onClick={async () => {
              await update.mutateAsync({ id: comment.id, body: draft, task_id: comment.task_id });
              setEditing(false);
            }}><Check className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      ) : (
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{renderBody(comment.body, comment.mentions)}</div>
      )}
    </div>
  );
};

const CommentsPanel = ({ taskId }: { taskId: string }) => {
  const uid = useEffectiveUserId();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const names = useEmployeeNameMap();

  return (
    <div className="space-y-3">
      <CommentComposer taskId={taskId} />
      <Separator />
      {isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> :
        comments.length === 0 ? <p className="text-sm text-muted-foreground">Комментариев пока нет.</p> :
        <div className="space-y-2">
          {comments.map((c) => <CommentItem key={c.id} comment={c} names={names} currentUserId={uid ? String(uid) : null} />)}
        </div>
      }
    </div>
  );
};

const AttachmentsPanel = ({ taskId }: { taskId: string }) => {
  const { data: attachments = [], isLoading } = useTaskAttachments(taskId);
  const upload = useUploadAttachment();
  const del = useDeleteAttachment();
  const fileInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 50 * 1024 * 1024) { toast.error(`Файл "${f.name}" больше 50 МБ`); continue; }
      await upload.mutateAsync({ task_id: taskId, file: f });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleDownload = async (path: string, filename: string) => {
    const url = await getAttachmentSignedUrl(path);
    if (!url) { toast.error("Не удалось получить ссылку"); return; }
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="space-y-3">
      <div>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <Button size="sm" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
          <Paperclip className="w-3.5 h-3.5 mr-1.5" />
          {upload.isPending ? "Загрузка…" : "Загрузить файлы"}
        </Button>
        <span className="text-xs text-muted-foreground ml-2">до 50 МБ на файл</span>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> :
        attachments.length === 0 ? <p className="text-sm text-muted-foreground">Вложений нет.</p> :
        <div className="space-y-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-md border p-2.5">
              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtSize(a.size_bytes)} · {format(new Date(a.created_at), "dd.MM.yyyy HH:mm")}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleDownload(a.storage_path, a.filename)}>
                <Download className="w-3.5 h-3.5" />
              </Button>
              <button onClick={() => del.mutate({ id: a.id, task_id: taskId })} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      }
    </div>
  );
};

const ACTION_LABELS: Record<string, string> = {
  status_change: "сменил(а) статус",
  comment_added: "добавил(а) комментарий",
  attachment_added: "прикрепил(а) файл",
  created: "создал(а) задачу",
};

const ActivityPanel = ({ taskId }: { taskId: string }) => {
  const { data: entries = [], isLoading } = useTaskActivity(taskId);
  const names = useEmployeeNameMap();
  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Активности пока нет.</p>;
  return (
    <ol className="space-y-3 border-l border-border ml-2 pl-4">
      {entries.map((e) => {
        const actor = e.actor_id ? (names.get(String(e.actor_id)) || `ID ${String(e.actor_id).slice(0, 8)}`) : "Система";
        const label = ACTION_LABELS[e.action] || e.action;
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-primary" />
            <div className="text-sm">
              <span className="font-medium">{actor}</span> <span className="text-muted-foreground">{label}</span>
              {e.action === "status_change" && (
                <span className="text-xs text-muted-foreground ml-1">
                  {e.status_from ?? "—"} → <span className="text-foreground">{e.status_to}</span>
                </span>
              )}
              {e.action === "comment_added" && e.payload?.preview && (
                <div className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">«{e.payload.preview}»</div>
              )}
              {e.action === "attachment_added" && e.payload?.filename && (
                <span className="text-xs text-muted-foreground ml-1">— {e.payload.filename}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ru })}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

interface TaskDetailDialogProps {
  task: TrackerTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TaskDetailDialog = ({ task, open, onOpenChange }: TaskDetailDialogProps) => {
  const [tab, setTab] = useState<"comments" | "attachments" | "activity">("comments");
  const { data: attachments = [] } = useTaskAttachments(task?.id ?? null);
  const { data: comments = [] } = useTaskComments(task?.id ?? null);

  useEffect(() => { if (open) setTab("comments"); }, [open, task?.id]);

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{task.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <TaskStatusBadge status={task.status} />
            <UrgencyBadge urgency={task.urgency} />
            {task.story_points != null && <Badge variant="outline" className="font-mono">{task.story_points} SP</Badge>}
            {task.due_at && (
              <span className="text-xs text-muted-foreground">
                Срок: {format(new Date(task.due_at), "dd.MM.yyyy HH:mm")}
              </span>
            )}
          </div>
        </DialogHeader>

        {task.description && (
          <div className="text-sm text-muted-foreground whitespace-pre-wrap border rounded-md p-3 bg-muted/30">
            {task.description}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="comments" className="gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />Комментарии
              {comments.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{comments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="attachments" className="gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />Вложения
              {attachments.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{attachments.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <ActivityIcon className="w-3.5 h-3.5" />Активность
            </TabsTrigger>
          </TabsList>
          <TabsContent value="comments" className="mt-4"><CommentsPanel taskId={task.id} /></TabsContent>
          <TabsContent value="attachments" className="mt-4"><AttachmentsPanel taskId={task.id} /></TabsContent>
          <TabsContent value="activity" className="mt-4"><ActivityPanel taskId={task.id} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailDialog;
