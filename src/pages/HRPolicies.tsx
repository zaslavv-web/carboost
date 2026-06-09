import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelStorage } from "@/integrations/laravel/storage";
import { aiInvoke } from "@/integrations/laravel/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealPrimaryRole, useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2, CheckCircle, XCircle, Clock, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type DocType = "talent_management" | "hr_strategy" | "motivation_strategy";

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  processing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
};

const DocumentBlock = ({ docType }: { docType: DocType }) => {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const realRole = useRealPrimaryRole();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation("admin");
  const [uploading, setUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const companyId = profile?.company_id ?? null;
  const canManageWithoutCompany = realRole === "superadmin";

  const DOC_TYPE_LABELS: Record<DocType, { title: string; description: string }> = {
    talent_management: {
      title: t("hrPolicies.policyTalentTitle"),
      description: t("hrPolicies.policyTalentDesc"),
    },
    hr_strategy: {
      title: t("hrPolicies.policyHrStrategyTitle"),
      description: t("hrPolicies.policyHrStrategyDesc"),
    },
    motivation_strategy: {
      title: t("hrPolicies.policyMotivationTitle"),
      description: t("hrPolicies.policyMotivationDesc"),
    },
  };

  const statusLabels: Record<string, string> = {
    pending: t("hrPolicies.statusPending"),
    processing: t("hrPolicies.statusProcessing"),
    completed: t("hrPolicies.statusCompleted"),
    failed: t("hrPolicies.statusFailed"),
  };

  const config = DOC_TYPE_LABELS[docType];

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["hr_documents", docType],
    queryFn: async () => {
      const { data, error } = await laravelDb
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
      if (!file) throw new Error("Select a file");
      if (!user) throw new Error("Auth required");
      if (profileLoading) throw new Error("Loading profile");
      if (!companyId && !canManageWithoutCompany) {
        throw new Error("No company assigned");
      }

      const allowed = [".doc", ".docx", ".pdf", ".csv", ".xlsx"];
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowed.includes(ext)) throw new Error(t("hrPolicies.formats"));

      setUploading(true);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${docType}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await laravelStorage.from("hr-documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: signedData, error: signError } = await laravelStorage.from("hr-documents").createSignedUrl(filePath, 600);
      if (signError || !signedData?.signedUrl) throw signError || new Error("URL error");

      const { data: doc, error: insertError } = await laravelDb
        .from("hr_documents")
        .insert({
          document_type: docType,
          title: file.name.replace(/\.[^.]+$/, ""),
          file_url: signedData.signedUrl,
          file_name: file.name,
          created_by: user!.id,
          company_id: companyId,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const { error: fnError } = await aiInvoke("parse-hr-document", {
        body: { documentId: doc.id, fileUrl: signedData.signedUrl, fileName: file.name, documentType: docType },
      });
      if (fnError) console.error("Parse error:", fnError);

      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      toast.success(t("hrPolicies.toastUploaded"));
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
      if (!extracted?.scenario) throw new Error("No scenario data");

      const { error } = await laravelDb.from("assessment_scenarios").insert({
        title: extracted.scenario.title || doc.title,
        description: extracted.scenario.description,
        scenario_data: extracted.scenario,
        created_by: user!.id,
        company_id: companyId,
      });
      if (error) throw error;

      const { data: scenarios } = await laravelDb
        .from("assessment_scenarios")
        .select("id")
        .eq("title", extracted.scenario.title || doc.title)
        .order("created_at", { ascending: false })
        .limit(1);

      if (scenarios?.[0]) {
        await laravelDb.from("hr_documents").update({ scenario_id: scenarios[0].id }).eq("id", doc.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      queryClient.invalidateQueries({ queryKey: ["assessment_scenarios"] });
      toast.success(t("hrPolicies.toastScenarioCreated"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await laravelDb.from("hr_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr_documents", docType] });
      toast.success(t("hrPolicies.toastDeleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground text-lg">{config.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("hrPolicies.formats")}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".doc,.docx,.pdf,.csv,.xlsx"
            className="text-sm text-muted-foreground file:mr-3 file:px-4 file:py-2 file:rounded-lg file:bg-secondary file:text-foreground file:text-sm file:font-medium file:border-0 file:cursor-pointer"
          />
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploading || uploadMutation.isPending || profileLoading}
            size="sm"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("hrPolicies.uploadBtn")}
          </Button>
        </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t("hrPolicies.noDocuments")}</p>
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
                      <span>· {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true, locale: getDateLocale() })}</span>
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
                          {t("hrPolicies.createScenario")}
                        </Button>
                      )}
                      {doc.scenario_id && (
                        <span className="text-xs text-success font-medium px-2">{t("hrPolicies.scenarioCreated")}</span>
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

              {expandedDoc === doc.id && doc.extracted_data && (
                <div className="border-t border-border p-4 bg-secondary/30 space-y-3">
                  {doc.extracted_data.summary && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("hrPolicies.summary")}</p>
                      <p className="text-sm text-foreground">{doc.extracted_data.summary}</p>
                    </div>
                  )}
                  {doc.extracted_data.key_points?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("hrPolicies.keyPoints")}</p>
                      <ul className="list-disc list-inside text-sm text-foreground space-y-1">
                        {doc.extracted_data.key_points.map((p: string, i: number) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {doc.extracted_data.scenario && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t("hrPolicies.scenarioSection")}</p>
                      <p className="text-sm font-medium text-foreground">{doc.extracted_data.scenario.title}</p>
                      <p className="text-sm text-muted-foreground">{doc.extracted_data.scenario.description}</p>
                      {doc.extracted_data.scenario.questions?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {doc.extracted_data.scenario.questions.map((q: any, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {i + 1}. {q.question} ({t("hrPolicies.maxScore", { score: q.max_score })})
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
  const { t } = useTranslation("admin");
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("hrPolicies.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("hrPolicies.subtitle")}
        </p>
      </div>

      <DocumentBlock docType="talent_management" />
      <DocumentBlock docType="hr_strategy" />
      <DocumentBlock docType="motivation_strategy" />
    </div>
  );
};

export default HRPolicies;
