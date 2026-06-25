import { useState } from "react";
import { useProjects, useCreateProject, useUpdateProject, useWorkflows } from "@/hooks/tracker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FolderKanban, Archive, Workflow } from "lucide-react";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import { useNavigate, Link } from "react-router-dom";

const ProjectCreateDialog = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "" });
  const create = useCreateProject();
  const save = async () => {
    const key = form.key.trim().toUpperCase().slice(0, 16);
    if (!key || !form.name.trim()) return;
    await create.mutateAsync({
      key,
      name: form.name.trim(),
      description: form.description.trim() || null,
    });
    setOpen(false);
    setForm({ key: "", name: "", description: "" });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1.5" />Новый проект</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новый проект</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ключ (3–6 символов, латиница)</Label>
            <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="PROD" />
          </div>
          <div>
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Платформа продукта" />
          </div>
          <div>
            <Label>Описание</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={save} disabled={create.isPending}>Создать</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TrackerProjects = () => {
  const { data: projects = [], isLoading } = useProjects();
  const { data: workflows = [] } = useWorkflows();
  const { setProjectId } = useTrackerProject();
  const navigate = useNavigate();
  const update = useUpdateProject();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Проекты</h2>
          <p className="text-sm text-muted-foreground">Пространства для задач — аналог проектов в Jira/досок в Trello.</p>
        </div>
        <ProjectCreateDialog />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : projects.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Пока нет проектов. Создайте первый.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Card key={p.id} className={p.status === "archived" ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.key}</div>
                    </div>
                  </div>
                  {p.status === "archived" && <Archive className="w-4 h-4 text-muted-foreground" />}
                </div>
                {p.description && <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => { setProjectId(p.id); navigate("/tracker/board"); }}
                  >Открыть доску</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: p.id, status: p.status === "active" ? "archived" : "active" })}
                  >
                    {p.status === "active" ? "В архив" : "Активировать"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackerProjects;
