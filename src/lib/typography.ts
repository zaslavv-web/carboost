// Микро-типографика для русского интерфейса.
// nbspify — заменяет пробел после коротких предлогов/союзов на неразрывный,
// чтобы они не оставались «висячими» в конце строки.

const NBSP = "\u00A0";

// Короткие предлоги, союзы и частицы (RU + EN).
const SHORT_WORDS = [
  "в", "во", "и", "а", "но", "до", "из", "от", "по", "на", "о", "об", "с", "со",
  "у", "к", "ко", "за", "над", "под", "при", "про", "для", "не", "ни", "же", "ли", "бы", "то",
  "or", "and", "in", "on", "at", "to", "of", "by", "the", "a", "an", "is", "be",
];

const RE = new RegExp(
  `(^|[\\s(>])(${SHORT_WORDS.join("|")})\\s+`,
  "giu"
);

export function nbspify(input: string | null | undefined): string {
  if (!input) return "";
  // повторяем дважды — на случай двух предлогов подряд
  return input.replace(RE, (_m, pre, word) => `${pre}${word}${NBSP}`).replace(RE, (_m, pre, word) => `${pre}${word}${NBSP}`);
}

// React helper: <T>{t("...")} → {nbsp(t("..."))}
export const nbsp = nbspify;
