import { useProjects } from "@/hooks/tracker";
import { useTrackerProject } from "@/contexts/TrackerProjectContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban } from "lucide-react";

export const ProjectSelector = () => {
  const { projectId, setProjectId } = useTrackerProject();
  const { data: projects = [], isLoading } = useProjects({ status: "active" });

  return (
    <div className="flex items-center gap-2 min-w-[220px]">
      <FolderKanban className="w-4 h-4 text-muted-foreground" />
      <Select
        value={projectId ?? "__inbox__"}
        onValueChange={(v) => setProjectId(v === "__inbox__" ? null : v)}
        disabled={isLoading}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Все поручения" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__inbox__">Inbox (без проекта)</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="font-mono text-xs text-muted-foreground mr-2">{p.key}</span>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
