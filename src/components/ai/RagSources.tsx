import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface RagSource {
  title?: string | null;
  source_id?: string | null;
  score?: number | null;
  snippet?: string | null;
  chunk_text?: string | null;
}

interface Props {
  sources: RagSource[];
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Отображает список RAG-источников (название документа, фрагмент, score),
 * использованных AI при генерации ответа. Сворачиваемый блок.
 */
export const RagSources = ({ sources, defaultOpen = false, className = "" }: Props) => {
  const { t } = useTranslation("admin");
  const [open, setOpen] = useState(defaultOpen);
  if (!sources || sources.length === 0) return null;

  return (
    <div className={`bg-secondary/40 rounded-lg border border-border ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {t("support.aiSourcesTitle", { defaultValue: "Источники из базы знаний" })}
          <span className="text-muted-foreground/70">({sources.length})</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-2">
          {sources.map((s, i) => {
            const text = s.snippet ?? s.chunk_text ?? "";
            const score = typeof s.score === "number" ? s.score : null;
            return (
              <li key={`${s.source_id || "src"}-${i}`} className="bg-background/60 rounded-md p-2.5 border border-border/60">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {i + 1}. {s.title || t("support.aiSourceUntitled", { defaultValue: "Без названия" })}
                  </p>
                  {score !== null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono flex-shrink-0">
                      {score.toFixed(3)}
                    </span>
                  )}
                </div>
                {text && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{text}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RagSources;
