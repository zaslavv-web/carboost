/**
 * Персональные дела сотрудников (Волна 5, Core HR).
 *
 * Сотрудник видит только свои документы.
 * HRD/Company Admin видит все документы всех сотрудников, может загружать
 * и назначать владельца.
 * Отдельная вкладка «Истекающие» — всё, что истечёт в ближайшие 60 дней.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  FileText, Plus, Trash2, AlertTriangle, Loader2, Download, ShieldAlert,
} from "lucide-react";

import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { usePrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Doc = {
  id: string;
  title: string;
  description?: string | null;
  document_type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  owner_user_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_confidential?: boolean;
  created_at: string;
};

type Employee = { user_id: string; full_name?: string | null; email?: string | null };

const DOC_TYPES = [
  { value: "contract",    label: "Трудовой договор" },
  { value: "supplement",  label: "Доп. соглашение" },
  { value: "order",       label: "Приказ" },
  { value: "certificate", label: "Справка" },
  { value: "medical",     label: "Медицинская книжка" },
  { value: "ndaс",        label: "NDA" },
  { value: "other",       label: "Другое" },
];

const HrDocumentsPersonal = () => {
  const role = usePrimaryRole();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const isHr = role === "hrd" || role === "company_admin" || role === "superadmin";
  const [tab, setTab] = useState<"mine" | "all" | "expiring">(isHr ? "all" : "mine");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ["hr-docs", "mine", profile?.user_id],
    queryFn: async () => {
      const { data } = await laravelDb
        .from("hr_documents")
        .select("*")
        .eq("owner_user_id", profile!.user_id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
    enabled: !!profile?.user_id,
  });

  const { data: all = [], isLoading: loadingAll } = useQuery({
    queryKey: ["hr-docs", "all"],
    queryFn: async () => {
      const { data } = await laravelDb
        .from("hr_documents")
        .select("*")
        .not("owner_user_id", "is", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
    enabled: isHr,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-docs", "employees"],
    queryFn: async () => {
      const { data } = await laravelDb.from("profiles").select("user_id,full_name,email");
      return (data ?? []) as Employee[];
    },
    enabled: isHr,
  });

  const expiringSoon = useMemo(() => {
    const source = isHr ? all : mine;
    const now = new Date();
    const in60 = new Date();
    in60.setDate(now.getDate() + 60);
    return source.filter((d) => {
      if (!d.valid_until) return false;
      const vu = new Date(d.valid_until);
      return vu >= now && vu <= in60;
    });
  }, [all, mine, isHr]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("hr_documents").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Документ удалён");
      qc.invalidateQueries({ queryKey: ["hr-docs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Ошибка"),
  });

  const empName = (uid?: string | null) =>
    (uid && employees.find((e) => e.user_id === uid)?.full_name) || uid || "—";

  const renderCard = (d: Doc) => {
    const expired = d.valid_until && new Date(d.valid_until) < new Date();
    const typeLabel = DOC_TYPES.find((t) => t.value === d.document_type)?.label || d.document_type || "—";
    return (
      <div key={d.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <h4 className="font-semibold truncate">{d.title}</h4>
              <Badge variant="secondary">{typeLabel}</Badge>
              {d.is_confidential && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <ShieldAlert className="w-3 h-3 mr-1" /> Конфиденциально
                </Badge>
              )}
              {expired && <Badge variant="destructive">Истёк</Badge>}
            </div>
            {isHr && d.owner_user_id && (
              <p className="text-xs text-muted-foreground mt-1">👤 {empName(d.owner_user_id)}</p>
            )}
            {d.description && <p className="text-sm mt-1.5">{d.description}</p>}
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
              {d.valid_from && <span>С: {format(new Date(d.valid_from), "dd.MM.yyyy")}</span>}
              {d.valid_until && (
                <span className={expired ? "text-destructive" : ""}>
                  До: {format(new Date(d.valid_until), "dd.MM.yyyy")}
                </span>
              )}
              <span>Загружен: {format(new Date(d.created_at), "dd.MM.yyyy")}</span>
            </p>
          </div>
          <div className="flex gap-1">
            {d.file_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            )}
            {isHr && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.confirm("Удалить?") && remove.mutate(d.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderList = (items: Doc[], loading: boolean, emptyMsg: string) => {
    if (loading) return <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto my-12" />;
    if (items.length === 0)
      return <p className="text-center text-muted-foreground py-8">{emptyMsg}</p>;
    return <div className="space-y-2">{items.map(renderCard)}</div>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Персональные HR-документы</h1>
          <p className="text-muted-foreground text-sm">
            Договоры, приказы, справки, доп.соглашения — единое персональное дело каждого сотрудника
          </p>
        </div>
        {isHr && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1.5" /> Загрузить документ</Button>
            </DialogTrigger>
            <UploadDialog
              employees={employees}
              onClose={() => setDialogOpen(false)}
              onCreated={() => {
                setDialogOpen(false);
                qc.invalidateQueries({ queryKey: ["hr-docs"] });
              }}
            />
          </Dialog>
        )}
      </div>

      {expiringSoon.length > 0 && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span>
            <b>{expiringSoon.length}</b> документ(ов) истечёт в ближайшие 60 дней
          </span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="mine">Мои документы</TabsTrigger>
          {isHr && <TabsTrigger value="all">Все сотрудники</TabsTrigger>}
          <TabsTrigger value="expiring">Истекающие</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          {renderList(mine, loadingMine, "У вас пока нет загруженных персональных документов")}
        </TabsContent>
        {isHr && (
          <TabsContent value="all" className="mt-4">
            {renderList(all, loadingAll, "Персональные документы сотрудников не загружены")}
          </TabsContent>
        )}
        <TabsContent value="expiring" className="mt-4">
          {renderList(expiringSoon, false, "Все документы действительны более 60 дней")}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const UploadDialog = ({
  employees, onClose, onCreated,
}: { employees: Employee[]; onClose: () => void; onCreated: () => void }) => {
  const { data: profile } = useUserProfile();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [docType, setDocType] = useState("contract");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title || !ownerId) {
      toast.error("Название и владелец обязательны");
      return;
    }
    setSaving(true);
    try {
      let fileUrl = "";
      let fileName = "";
      if (file) {
        const path = `hr-documents/${profile?.company_id ?? "shared"}/${Date.now()}_${file.name}`;
        const { data, error } = await laravelStorage
          .from("hr-documents")
          .upload(path, file);
        if (error) throw new Error(error.message);
        const { data: pub } = laravelStorage.from("hr-documents").getPublicUrl(data.path);
        fileUrl = pub.publicUrl;
        fileName = file.name;
      }

      const { error } = await laravelDb.from("hr_documents").insert({
        title,
        description: description || null,
        document_type: docType,
        owner_user_id: ownerId,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        is_confidential: confidential,
        file_url: fileUrl || null,
        file_name: fileName || null,
        created_by: profile!.user_id,
        processing_status: "completed",
      });
      if (error) throw new Error(error.message);
      toast.success("Документ загружен");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка загрузки");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Новый персональный документ</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
        <div>
          <Label>Название *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Сотрудник *</Label>
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.user_id} value={e.user_id}>
                  {e.full_name || e.email || e.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Тип документа</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Действует с</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <Label>Действует до</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Описание</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>Файл</Label>
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={confidential}
            onChange={(e) => setConfidential(e.target.checked)}
            className="rounded"
          />
          Конфиденциально (доступ только владельцу и HR)
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          Сохранить
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export default HrDocumentsPersonal;
