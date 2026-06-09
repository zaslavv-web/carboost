import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravelDb } from "@/integrations/laravel/db";
import { laravelRpc } from "@/integrations/laravel/rpc";
import { laravelStorage } from "@/integrations/laravel/storage";
import { toast } from "sonner";
import { Loader2, FileText, CheckCircle2, XCircle, Download, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/dateLocale";

const CareerReviews = () => {
  const { t } = useTranslation("manager");
  const dfLocale = getDateLocale();
  const qc = useQueryClient();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["career_reviews_pending"],
    queryFn: async () => {
      const { data, error } = await laravelDb
        .from("career_step_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const userIds = Array.from(new Set(submissions.map((s) => s.user_id)));
  const templateIds = Array.from(new Set(submissions.map((s) => s.template_id)));

  const { data: profiles = [] } = useQuery({
    queryKey: ["review_profiles", userIds],
    queryFn: async () => {
      if (!userIds.length) return [];
      const { data } = await laravelDb.from("profiles").select("user_id, full_name, position, department").in("user_id", userIds);
      return data || [];
    },
    enabled: userIds.length > 0,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["review_templates", templateIds],
    queryFn: async () => {
      if (!templateIds.length) return [];
      const { data } = await laravelDb.from("career_track_templates").select("id, title, steps").in("id", templateIds);
      return data || [];
    },
    enabled: templateIds.length > 0,
  });

  const submissionIds = submissions.map((s) => s.id);
  const { data: filesData = [] } = useQuery({
    queryKey: ["review_files", submissionIds],
    queryFn: async () => {
      if (!submissionIds.length) return [];
      const { data } = await laravelDb
        .from("career_step_submission_files")
        .select("*")
        .in("submission_id", submissionIds);
      return data || [];
    },
    enabled: submissionIds.length > 0,
  });

  const attemptIds = submissions.map((s) => s.test_attempt_id).filter(Boolean) as string[];
  const { data: attempts = [] } = useQuery({
    queryKey: ["review_attempts", attemptIds],
    queryFn: async () => {
      if (!attemptIds.length) return [];
      const { data } = await laravelDb.from("test_attempts").select("id, score, total, created_at").in("id", attemptIds);
      return data || [];
    },
    enabled: attemptIds.length > 0,
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
  const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]));
  const attemptMap = Object.fromEntries(attempts.map((a) => [a.id, a]));

  const reviewMutation = useMutation({
    mutationFn: async ({ id, approve, why }: { id: string; approve: boolean; why?: string }) => {
      const { error } = await laravelRpc("review_career_step", {
        _submission_id: id,
        _approve: approve,
        _reason: why || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["career_reviews_pending"] });
      toast.success(vars.approve ? t("careerReviews.toast.approved") : t("careerReviews.toast.rejected"));
      setReasonFor(null);
      setReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadFile = async (path: string, name: string) => {
    const { data, error } = await laravelStorage.from("career-submissions").createSignedUrl(path, 600);
    if (error) {
      toast.error(t("careerReviews.toast.fileError"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );

  const pending = submissions.filter((s) => s.status === "pending_review");
  const history = submissions.filter((s) => s.status !== "pending_review").slice(0, 20);

  const renderItem = (s: any) => {
    const profile = profileMap[s.user_id];
    const template = templateMap[s.template_id];
    const stepData = (template?.steps as any[])?.[s.step_order];
    const stepFiles = filesData.filter((f) => f.submission_id === s.id);
    const attempt = s.test_attempt_id ? attemptMap[s.test_attempt_id] : null;
    const statusBadge =
      s.status === "approved"
        ? "bg-success/15 text-success"
        : s.status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-info/15 text-info";

    return (
      <div key={s.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{profile?.full_name || t("careerReviews.employeeFallback")}</p>
            <p className="text-xs text-muted-foreground">
              {profile?.position || "—"} · {profile?.department || "—"}
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${statusBadge}`}>
            {s.status === "approved" ? t("careerReviews.status.approved") : s.status === "rejected" ? t("careerReviews.status.rejected") : t("careerReviews.status.pending")}
          </span>
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">{t("careerReviews.track")}</span>{" "}
          <span className="font-medium">{template?.title}</span> · {t("careerReviews.step")} {s.step_order + 1}
          {stepData?.title && <span className="text-muted-foreground"> · {stepData.title}</span>}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: dfLocale })}
          </span>
          <span>· {t("careerReviews.attempt")} {s.attempt_no}</span>
          {s.is_reinforced && (
            <span className="flex items-center gap-1 text-warning">
              <RefreshCw className="w-3 h-3" /> {t("careerReviews.reinforced")}
            </span>
          )}
        </div>

        {attempt && (
          <div className="text-xs bg-secondary/40 rounded-lg p-2">
            <span className="text-muted-foreground">{t("careerReviews.testResult")} </span>
            <span className="font-medium">{attempt.score}%</span>
          </div>
        )}

        {s.comment && (
          <div className="text-sm bg-secondary/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">{t("careerReviews.employeeComment")}</p>
            <p className="text-foreground/90 whitespace-pre-wrap">{s.comment}</p>
          </div>
        )}

        {stepFiles.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("careerReviews.files", { count: stepFiles.length })}</p>
            <div className="space-y-1">
              {stepFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => downloadFile(f.file_url, f.file_name || "file")}
                  className="w-full flex items-center gap-2 p-2 rounded-lg bg-secondary/40 hover:bg-secondary/60 text-sm transition-colors text-left"
                >
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{f.file_name || t("careerReviews.fileFallback")}</span>
                  <Download className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {s.rejection_reason && (
          <div className="text-xs bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-destructive">
            {t("careerReviews.rejectionReason")} {s.rejection_reason}
          </div>
        )}

        {s.status === "pending_review" && (
          <>
            {reasonFor === s.id ? (
              <div className="space-y-2 pt-2 border-t border-border">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder={t("careerReviews.rejectPlaceholder")}
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setReasonFor(null);
                      setReason("");
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm hover:bg-secondary/60"
                  >
                    {t("careerReviews.cancel")}
                  </button>
                  <button
                    disabled={!reason.trim() || reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: s.id, approve: false, why: reason })}
                    className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm disabled:opacity-50"
                  >
                    {t("careerReviews.confirmReject")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ id: s.id, approve: true })}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> {t("careerReviews.confirmApprove")}
                </button>
                <button
                  onClick={() => setReasonFor(s.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20"
                >
                  <XCircle className="w-4 h-4" /> {t("careerReviews.rejectBtn")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("careerReviews.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("careerReviews.subtitle")}
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">{t("careerReviews.pendingTitle", { count: pending.length })}</h2>
        {pending.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">{t("careerReviews.allProcessed")}</p>
          </div>
        ) : (
          <div className="space-y-3">{pending.map(renderItem)}</div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">{t("careerReviews.historyTitle", { count: history.length })}</h2>
          <div className="space-y-3">{history.map(renderItem)}</div>
        </div>
      )}
    </div>
  );
};

export default CareerReviews;
