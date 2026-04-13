import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2, CheckCircle, XCircle, Clock, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";

type DocType = "talent_management" | "hr_strategy" | "motivation_strategy";

const DOC_TYPE_LABELS: Record<DocType, { title: string; description: string }> = {
  talent_management: {
    title: "Политика управления талантами",
    description: "Загрузите документ с политикой управления талантами для автоматической генерации сценариев оценки",
  },
  hr_strategy: {
    title: "HR-стратегия",
    description: "Загрузите документ с HR-стратегией компании для формирования критериев оценки",
  },
  motivation_strategy: {
    title: "Стратегия мотивации",
    description: "Загрузите документ со стратегией мотивации для создания оценочных сценариев",
  },
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  processing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
};

const statusLabels: Record<string, string> = {
  pending: "Ожидает обработки",
  processing: "Обрабатывается...",
  completed: "Обработан",
  failed: "Ошибка",
};

const DocumentBlock = ({ docType }: { docType: DocType }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const config = DOC_TYPE_LABELS[docType];

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["hr_documents", docType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documents")
        .select("*")
        .eq("document_type", docType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Выберите файл");

      const allowed = [".doc", ".docx", ".pdf"];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowed.includes(ext)) throw new Error("Поддерживаются только DOC, DOCX и PDF файлы");

      setUploading(true);

      // Upload to storage
      const filePath = `${docType}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("hr-documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("hr-documents").getPublicUrl(filePath);

      // Create document record
      const { data: doc, error: insertError } = await supabase
        .from("hr_documents")
        .insert({
          document_type: docType,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_url: urlData.publicUrl,
          file_name: file.name,
          created_by: user!.id,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // Trigger AI parsing
      const { error: fnError } = await supabase.functions.invoke("parse-hr-document", {
        body: { documentId: doc.id, fileUrl: urlData.publicUrl, fileName: file.name, documentType: docType },
      });
      if (fnError) console.error("Parse error:", fnError);

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      toast.success("Документ загружен и отправлен на обработку");
      if (fileRef.current) fileRef.current.value = "";
      setUploading(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setUploading(false);
    },
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (doc: any) => {
      const extracted = doc.extracted_data;
      if (!extracted?.scenario) throw new Error("Нет данных для создания сценария");

      const { error } = await supabase.from("assessment_scenarios").insert({
        title: extracted.scenario.title || doc.title,
        description: extracted.scenario.description,
        scenario_data: extracted.scenario,
        created_by: user!.id,
      });
      if (error) throw error;

      // Link scenario
      const { data: scenarios } = await supabase
        .from("assessment_scenarios")
        .select("id")
        .eq("title", extracted.scenario.title || doc.title)
        .order("created_at", { ascending: false })
        .limit(1);

      if (scenarios?.[0]) {
        await supabase.from("hr_documents").update({ scenario_id: scenarios[0].id }).eq("id", doc.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success("Сценарий оценки создан");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      toast.success("Документ удалён");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground text-lg">{config.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
          <p className="text-xs text-muted-foreground mt-2">Форматы: DOC, DOCX, PDF</p>
        </div>

        {/* Upload */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".doc,.docx,.pdf"
            className="text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:bg-secondary file:text-foreground file:text-sm file:font-medium file:border-0 file:cursor-pointer"
          />
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploading || uploadMutation.isPending}
            size="sm"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Загрузить и обработать
          </Button>
        </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Документы ещё не загружены</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: any) => (
            <div key={doc.id} className="border border-border rounded-lg">
              <div className="flex items-center justify-between p-3 gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {statusIcons[doc.processing_status]}
                      <span>{statusLabels[doc.processing_status]}</span>
                      <span>· {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true, locale: ru })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.processing_status === "completed" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                        title="Просмотр"
                      >
                        {expandedDoc === doc.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      {!doc.scenario_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => createScenarioMutation.mutate(doc)}
                          disabled={createScenarioMutation.isPending}
                        >
                          Создать сценарий
                        </Button>
                      )}
                      {doc.scenario_id && (
                        <span className="text-xs text-success font-medium px-2">✓ Сценарий создан</span>
                      )}
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Expanded preview */}
              {expandedDoc === doc.id && doc.extracted_data && (
                <div className="border-t border-border p-4 bg-secondary/30 space-y-3">
                  {doc.extracted_data.summary && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Резюме</p>
                      <p className="text-sm text-foreground">{doc.extracted_data.summary}</p>
                    </div>
                  )}
                  {doc.extracted_data.key_points?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Ключевые пункты</p>
                      <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                        {doc.extracted_data.key_points.map((p: string, i: number) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {doc.extracted_data.scenario && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Сценарий оценки</p>
                      <p className="text-sm font-medium text-foreground">{doc.extracted_data.scenario.title}</p>
                      <p className="text-sm text-muted-foreground">{doc.extracted_data.scenario.description}</p>
                      {doc.extracted_data.scenario.questions?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {doc.extracted_data.scenario.questions.map((q: any, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {i + 1}. {q.question} (макс. {q.max_score} баллов)
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const HRPolicies = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Управление политиками</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Загрузка документов и автоматическая генерация сценариев оценки с помощью AI
        </p>
      </div>

      <DocumentBlock docType="talent_management" />
      <DocumentBlock docType="hr_strategy" />
      <DocumentBlock docType="motivation_strategy" />
    </div>
  );
};

export default HRPolicies;
