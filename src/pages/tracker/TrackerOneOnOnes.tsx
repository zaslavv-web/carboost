import { useState } from "react";
import { useOneOnOnes, useCreateOneOnOne, useUpdateOneOnOne, useAgenda, useUpsertAgenda, type TrackerOneOnOne, type MeetingStatus } from "@/hooks/tracker";
import { useEffectiveUserId } from "@/hooks/useUserProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MeetingStatusBadge } from "@/components/tracker/Badges";
import { Plus, CalendarClock, ListChecks } from "lucide-react";
import { format } from "date-fns";

const MEETING_STATUS_OPTIONS: { value: MeetingStatus; label: string }[] = [
  { value: "planned", label: "Запланирована" },
  { value: "done", label: "Проведена" },
  { value: "cancelled", label: "Отменена" },
];

const CreateDialog = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", scheduled_at: "", duration_minutes: 30 });
  const create = useCreateOneOnOne();
  const save = async () => {
    if (!form.employee_id.trim() || !form.scheduled_at) return;
    await create.mutateAsync({
      employee_id: form.employee_id.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: form.duration_minutes,
      status: "planned",
    });
    setOpen(false);
    setForm({ employee_id: "", scheduled_at: "", duration_minutes: 30 });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5" />Новая встреча</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Запланировать 1:1</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ID сотрудника</Label>
            <Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="UUID сотрудника" />
            <p className="text-xs text-muted-foreground mt-1">В следующей итерации заменим на селектор.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Дата и время</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
            <div><Label>Длительность, мин</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={save} disabled={create.isPending}>Запланировать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AgendaBlock = ({ meetingId }: { meetingId: string }) => {
  const { data: items = [] } = useAgenda(meetingId);
  const upsert = useUpsertAgenda();
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-4 pt-4 border-t space-y-2">
      <p className="text-sm font-medium flex items-center gap-1.5"><ListChecks className="w-4 h-4" />Повестка</p>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2">
          <Checkbox checked={it.is_done} onCheckedChange={(v) => upsert.mutate({ id: it.id, meeting_id: meetingId, is_done: !!v })} />
          <span className={`text-sm flex-1 ${it.is_done ? "line-through text-muted-foreground" : ""}`}>{it.title}</span>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Новый пункт…" className="h-8" />
        <Button size="sm" onClick={async () => { if (!draft.trim()) return; await upsert.mutateAsync({ meeting_id: meetingId, title: draft.trim(), position: items.length }); setDraft(""); }}>Добавить</Button>
      </div>
    </div>
  );
};

const MeetingCard = ({ meeting }: { meeting: TrackerOneOnOne }) => {
  const [expanded, setExpanded] = useState(false);
  const update = useUpdateOneOnOne();
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <CalendarClock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">{format(new Date(meeting.scheduled_at), "dd MMM yyyy, HH:mm")}</p>
            <p className="text-xs text-muted-foreground">
              Сотрудник: <span className="font-mono">{meeting.employee_id.slice(0, 8)}</span> · {meeting.duration_minutes} мин
            </p>
          </div>
          <MeetingStatusBadge status={meeting.status} />
          <Select value={meeting.status} onValueChange={(v: MeetingStatus) => update.mutate({ id: meeting.id, status: v })}>
            <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{MEETING_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setExpanded((e) => !e)}>{expanded ? "Свернуть" : "Повестка"}</Button>
        </div>
        {expanded && <AgendaBlock meetingId={meeting.id} />}
      </CardContent>
    </Card>
  );
};

const TrackerOneOnOnes = () => {
  const uid = useEffectiveUserId();
  const [scope, setScope] = useState<"as_manager" | "as_employee">("as_manager");
  const { data: meetings = [], isLoading } = useOneOnOnes(
    scope === "as_manager" ? { manager_id: uid ?? undefined } : { employee_id: uid ?? undefined }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={scope} onValueChange={(v: any) => setScope(v)}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="as_manager">Я провожу</SelectItem>
            <SelectItem value="as_employee">Со мной проводят</SelectItem>
          </SelectContent>
        </Select>
        <CreateDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Загрузка…</p>
      ) : meetings.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Встреч нет.</CardContent></Card>
      ) : (
        <div className="space-y-3">{meetings.map((m) => <MeetingCard key={m.id} meeting={m} />)}</div>
      )}
    </div>
  );
};

export default TrackerOneOnOnes;
