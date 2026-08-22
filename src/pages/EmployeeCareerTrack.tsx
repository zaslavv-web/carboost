import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Paperclip,
  Route as RouteIcon,
  XCircle,
} from "lucide-react";
import CareerTrackTestsTable from "@/components/CareerTrackTestsTable";

export interface TrackStepSubmission {
  id: string;
  attempt_no: number;
  is_reinforced: boolean;
  status: string;
  comment: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
  test_attempt_id: string | null;
  created_at: string;
  files: { id: string; file_url: string; file_name: string | null; file_size: number | null }[];
}

export interface TrackStep {
  order: number;
  title: string;
  description: string | null;
  duration_months: number | null;
  goals: string[];
  pass_conditions: string[];
  state: "passed" | "current" | "upcoming" | "rejected" | "pending_review";
  attempts: number;
  requires_test: boolean;
  min_test_score: number;
  submissions: TrackStepSubmission[];
}

export interface EmployeeTrack {
  assignment_id: string;
  template_id: string;
  title: string;
  description: string | null;
  estimated_months: number | null;
  from_position: string | null;
  to_position: string | null;
  status: string;
  current_step: number;
  total_steps: number;
  progress: number;
  personal_motivation: string | null;
  assigned_at: string | null;
  updated_at: string | null;
  steps: TrackStep[];
}

export interface TrackTestRow {
  id: string;
  title: string;
  source: string;
  score: number;
  total: number;
  percent: number;
  step_order: number | null;
  track_title: string | null;
  created_at: string;
}

interface Payload {
  employee: {
    user_id: string;
    full_name: string;
    position: string | null;
    department: string | null;
  };
  tracks: EmployeeTrack[];
  tests: TrackTestRow[];
}

const stateStyles: Record<TrackStep["state"], { icon: JSX.Element; label: string; cls: string }> = {
  passed: { icon: <CheckCircle2 className="w-4 h-4" />, label: "Пройден", cls: "text-success border-success/40 bg-success/10" },
  current: { icon: <Clock className="w-4 h-4" />, label: "Текущий", cls: "text-primary border-primary/40 bg-primary/10" },
  pending_review: { icon: <Clock className="w-4 h-4" />, label: "На проверке", cls: "text-warning border-warning/40 bg-warning/10" },
  rejected: { icon: <XCircle className="w-4 h-4" />, label: "Отклонён", cls: "text-destructive border-destructive/40 bg-destructive/10" },
  upcoming: { icon: <Circle className="w-4 h-4" />, label: "Впереди", cls: "text-muted-foreground border-border bg-secondary/30" },
};

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Карточка карьерного трека конкретного сотрудника: этапы + тестирования. */
const EmployeeCareerTrack = () => {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const [activeTrack, setActiveTrack] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee_career_track", userId],
    queryFn: async () => {
      const { data, error } = await laravel.get<Payload>(`/career-tracks/employee/${userId}`);
      if (error) throw new Error(error.message);
      return data as Payload;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const tracks = data?.tracks ?? [];
  const current = useMemo(
    () => tracks.find((t) => t.assignment_id === activeTrack) || tracks[0],
    [tracks, activeTrack],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{data?.employee.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {data?.employee.position || "—"}
            {data?.employee.department ? ` · ${data.employee.department}` : ""}
          </p>
        </div>
      </div>

      {tracks.length === 0 && (
        <div className="bg-card rounded-xl p-12 text-center border border-border">
          <RouteIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Карьерных треков нет</h3>
          <p className="text-sm text-muted-foreground">Назначьте трек в разделе «Карьерные треки».</p>
        </div>
      )}

      {tracks.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tracks.map((tr) => (
            <button
              key={tr.assignment_id}
              onClick={() => setActiveTrack(tr.assignment_id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                current?.assignment_id === tr.assignment_id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {tr.title}
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-foreground">{current.title}</h2>
              <Badge variant={current.status === "completed" ? "default" : "secondary"}>
                {current.status === "completed"
                  ? "Завершён"
                  : current.status === "failed"
                  ? "Провален"
                  : "Активен"}
              </Badge>
              {(current.from_position || current.to_position) && (
                <span className="text-xs text-muted-foreground">
                  {current.from_position || "—"} → {current.to_position || "—"}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Назначен {fmtDate(current.assigned_at)}
              </span>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  Шаг {Math.min(current.current_step + 1, current.total_steps)} из {current.total_steps}
                </span>
                <span>{current.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${current.progress}%` }} />
              </div>
            </div>
            {current.personal_motivation && (
              <p className="text-sm text-muted-foreground">{current.personal_motivation}</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-4">Этапы трека</h3>
            <div className="space-y-3">
              {current.steps.map((step) => {
                const s = stateStyles[step.state] ?? stateStyles.upcoming;
                return (
                  <div key={step.order} className={`rounded-lg border p-4 ${s.cls}`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{s.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {step.order + 1}. {step.title}
                          </span>
                          <Badge variant="outline" className="text-[11px]">{s.label}</Badge>
                          {step.attempts > 1 && (
                            <Badge variant="outline" className="text-[11px]">Попыток: {step.attempts}</Badge>
                          )}
                          {step.requires_test && (
                            <Badge variant="outline" className="text-[11px]">
                              Тест, порог {step.min_test_score}%
                            </Badge>
                          )}
                        </div>
                        {step.description && (
                          <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                        )}

                        {step.submissions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {step.submissions.map((sub) => (
                              <div key={sub.id} className="rounded-md bg-background/60 border border-border p-3">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>Попытка {sub.attempt_no}</span>
                                  <span>· {fmtDate(sub.created_at)}</span>
                                  <span>· статус: {sub.status}</span>
                                  {sub.reviewer_name && <span>· проверил: {sub.reviewer_name}</span>}
                                  {sub.reviewed_at && <span>({fmtDate(sub.reviewed_at)})</span>}
                                </div>
                                {sub.comment && (
                                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{sub.comment}</p>
                                )}
                                {sub.rejection_reason && (
                                  <p className="text-xs text-destructive mt-1">
                                    Причина отклонения: {sub.rejection_reason}
                                  </p>
                                )}
                                {sub.files.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {sub.files.map((f) => (
                                      <a
                                        key={f.id}
                                        href={f.file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary inline-flex items-center gap-1 underline-offset-2 hover:underline"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        {f.file_name || "файл"}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <CareerTrackTestsTable tests={data?.tests ?? []} />
    </div>
  );
};

export default EmployeeCareerTrack;
