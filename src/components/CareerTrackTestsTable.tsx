import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";
import { ChevronDown, ChevronRight, ClipboardList, Loader2 } from "lucide-react";
import type { TrackTestRow } from "@/pages/EmployeeCareerTrack";

interface AttemptReview {
  attempt: {
    id: string;
    title: string;
    score: number;
    total: number;
    created_at: string;
    competency_breakdown: { competency?: string; name?: string; score?: number; percent?: number }[];
  };
  questions: {
    index: number;
    question: string;
    options: string[];
    competency: string | null;
    given: string | number | null;
    correct: string | number | null;
    is_correct: boolean;
  }[];
}

const fmtDate = (v: string) =>
  new Date(v).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

const optionLabel = (options: string[], value: string | number | null) => {
  if (value === null || value === undefined || value === "") return "—";
  const idx = Number(value);
  if (!Number.isNaN(idx) && options[idx] !== undefined) return options[idx];
  return String(value);
};

/** Таблица тестирований сотрудника с разворачиваемым разбором ответов. */
const CareerTrackTestsTable = ({ tests }: { tests: TrackTestRow[] }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: review, isLoading } = useQuery({
    queryKey: ["career_track_attempt", openId],
    queryFn: async () => {
      const { data, error } = await laravel.get<AttemptReview>(`/career-tracks/attempt/${openId}`);
      if (error) throw new Error(error.message);
      return data as AttemptReview;
    },
    enabled: !!openId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary" /> Пройденные тестирования
      </h3>

      {tests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Тестирований пока нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium w-6" />
                <th className="py-2 pr-3 font-medium">Дата</th>
                <th className="py-2 pr-3 font-medium">Тест</th>
                <th className="py-2 pr-3 font-medium">Этап</th>
                <th className="py-2 pr-3 font-medium text-center">Результат</th>
                <th className="py-2 pr-3 font-medium text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => {
                const open = openId === t.id;
                return (
                  <>
                    <tr
                      key={t.id}
                      onClick={() => setOpenId(open ? null : t.id)}
                      className="border-b border-border/50 cursor-pointer hover:bg-secondary/30"
                    >
                      <td className="py-2 pr-3 text-muted-foreground">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{fmtDate(t.created_at)}</td>
                      <td className="py-2 pr-3 text-foreground font-medium">{t.title}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {t.step_order !== null ? `Этап ${t.step_order + 1}` : "—"}
                        {t.track_title ? ` · ${t.track_title}` : ""}
                      </td>
                      <td className="py-2 pr-3 text-center text-foreground">
                        {t.score}/{t.total}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <span
                          className={`font-semibold ${
                            t.percent >= 70 ? "text-success" : t.percent >= 40 ? "text-warning" : "text-destructive"
                          }`}
                        >
                          {t.percent}%
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${t.id}-detail`}>
                        <td colSpan={6} className="bg-secondary/20 px-4 py-3">
                          {isLoading && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" /> Загружаю разбор…
                            </div>
                          )}
                          {review && (
                            <div className="space-y-3">
                              {review.attempt.competency_breakdown?.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {review.attempt.competency_breakdown.map((c, i) => (
                                    <span key={i} className="text-xs px-2 py-1 rounded bg-background border border-border">
                                      {c.competency || c.name || "Компетенция"}: {c.percent ?? c.score ?? 0}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="space-y-2">
                                {review.questions.map((q) => (
                                  <div key={q.index} className="rounded-md border border-border bg-background p-3">
                                    <p className="text-sm text-foreground">
                                      {q.index + 1}. {q.question}
                                    </p>
                                    <p className="text-xs mt-1">
                                      <span className={q.is_correct ? "text-success" : "text-destructive"}>
                                        Ответ: {optionLabel(q.options, q.given)}
                                      </span>
                                      {!q.is_correct && (
                                        <span className="text-muted-foreground">
                                          {" "}· верно: {optionLabel(q.options, q.correct)}
                                        </span>
                                      )}
                                      {q.competency && (
                                        <span className="text-muted-foreground"> · {q.competency}</span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CareerTrackTestsTable;
