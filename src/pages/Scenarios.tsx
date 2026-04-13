import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileJson, Trash2, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import * as XLSX from "xlsx";

const Scenarios = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["assessment_scenarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_scenarios")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Выберите файл");

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      let parsed: any;

      if (ext === ".json") {
        const text = await file.text();
        parsed = JSON.parse(text);
      } else if (ext === ".csv") {
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map((h) => h.trim());
        parsed = lines.slice(1).map((line) => {
          const vals = line.split(",").map((v) => v.trim());
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
        });
      } else if (ext === ".xlsx" || ext === ".xls") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(firstSheet);
      } else if (ext === ".docx" || ext === ".pdf") {
        // Upload to storage and parse with AI
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `scenarios/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage.from("hr-documents").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("hr-documents").getPublicUrl(filePath);

        const { data: result, error: fnError } = await supabase.functions.invoke("parse-hr-document", {
          body: {
            documentId: null,
            fileUrl: urlData.publicUrl,
            fileName: file.name,
            documentType: "scenario_upload",
          },
        });
        if (fnError) throw fnError;
        parsed = result?.data?.scenario || result?.data || result;
      } else {
        throw new Error("Поддерживаются форматы: CSV, XLSX, JSON, DOCX, PDF");
      }

      const { error } = await supabase.from("assessment_scenarios").insert({
        title: title || file.name,
        description,
        scenario_data: parsed,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success("Сценарий загружен");
      setTitle("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("assessment_scenarios")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assessment_scenarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success("Сценарий удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Сценарии оценки</h1>
        <p className="text-muted-foreground text-sm mt-1">Загрузка и управление сценариями для AI-оценки сотрудников</p>
      </div>

      {/* Upload form */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">Загрузить сценарий</h3>
        <p className="text-xs text-muted-foreground">Поддерживаемые форматы: CSV, XLSX, JSON, DOCX, PDF</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название сценария"
            className="px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (опционально)"
            className="px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="flex items-center gap-4">
          <input ref={fileRef} type="file" accept=".json,.csv,.xlsx,.xls,.docx,.pdf" className="text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:bg-secondary file:text-foreground file:text-sm file:font-medium file:border-0 file:cursor-pointer" />
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Загрузить
          </button>
        </div>
      </div>

      {/* Scenarios list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : scenarios.length === 0 ? (
        <div className="text-center py-16">
          <FileJson className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Сценарии ещё не загружены</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map((s: any) => (
            <div key={s.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileJson className="w-8 h-8 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {Array.isArray(s.scenario_data) ? `${s.scenario_data.length} элементов` : "Данные загружены"} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleMutation.mutate({ id: s.id, active: !s.is_active })}
                  className={`p-1.5 rounded-lg transition-colors ${s.is_active ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-secondary"}`}
                  title={s.is_active ? "Активен" : "Неактивен"}
                >
                  {s.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(s.id)}
                  className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Scenarios;
