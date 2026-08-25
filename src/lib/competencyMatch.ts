/**
 * Единый расчёт соответствия сотрудника эталону должности.
 * Используется и дашбордом HRD, и попапом сравнения — чтобы проценты совпадали.
 */

export type CompetencyRow = {
  skill: string;
  /** Эталонный уровень должности (0 = эталон не задан). */
  required: number;
  /** Оценка сотрудника (null = оценки нет). */
  actual: number | null;
  status: "matched" | "no_benchmark" | "no_assessment";
  /** Разница «сотрудник − эталон», только для полных пар. */
  diff: number | null;
};

/** Приводит competency_profile должности (json/строка) к списку пар навык→уровень. */
export function parseCompetencyProfile(raw: unknown): { name: string; required_level: number }[] {
  const parsed =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })()
      : raw;

  return (Array.isArray(parsed) ? parsed : [])
    .map((item: any) => ({
      name: String(item?.name ?? item?.skill ?? "").trim(),
      required_level: Number(item?.required_level ?? item?.target_value ?? 0),
    }))
    .filter((item) => item.name !== "" && item.required_level > 0);
}

/** Строит сравнительную таблицу «эталон × оценка» по всем известным навыкам. */
export function buildCompetencyRows(
  profile: { name: string; required_level: number }[],
  competencies: { skill_name: string; skill_value: number }[],
): CompetencyRow[] {
  const skills = new Set<string>();
  profile.forEach((p) => skills.add(p.name));
  competencies.forEach((c) => skills.add(c.skill_name));

  return Array.from(skills).map((skill) => {
    const required = profile.find((p) => p.name === skill)?.required_level ?? 0;
    const match = competencies.find((c) => c.skill_name === skill);
    const actual = match ? Number(match.skill_value) : null;

    const status: CompetencyRow["status"] =
      required <= 0 ? "no_benchmark" : actual === null ? "no_assessment" : "matched";

    return {
      skill,
      required,
      actual,
      status,
      diff: status === "matched" ? (actual as number) - required : null,
    };
  });
}

/**
 * Процент соответствия: среднее по полным парам, вклад каждого навыка ≤ 100%.
 * Возвращает null, если ни одной полной пары нет (нечего сравнивать).
 */
export function competencyMatchPercent(rows: CompetencyRow[]): number | null {
  const scored = rows.filter((r) => r.status === "matched" && r.required > 0);
  if (scored.length === 0) return null;

  const total = scored.reduce((sum, r) => sum + Math.min(1, (r.actual as number) / r.required), 0);
  return Math.round((total / scored.length) * 100);
}

export function matchTone(percent: number | null): "success" | "warning" | "destructive" | "muted" {
  if (percent === null) return "muted";
  if (percent >= 80) return "success";
  if (percent >= 50) return "warning";
  return "destructive";
}
