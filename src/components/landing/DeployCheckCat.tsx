/**
 * ВРЕМЕННЫЙ маркер проверки доставки на прод. Удалить после проверки:
 * этот файл + одна строка <DeployCheckCat /> в src/pages/Landing.tsx.
 *
 * Зачем два разных признака рядом:
 *   - сам котик живёт только в новом JS-бандле, поэтому его появление
 *     доказывает, что браузеру отдан свежий бандл;
 *   - SHA читается из /version.json, который деплой кладёт в веб-рут ОТДЕЛЬНО
 *     от сборки.
 * Если котика нет, а SHA новый — маркеры доехали, а бандл отдаётся старый
 * (кеш, не тот каталог, CDN). Это ровно тот случай, который до сих пор
 * приходилось ловить косвенно.
 *
 * Картинка нарисована инлайновым SVG, а не взята с внешнего сервиса: чужой
 * хост на боевом лендинге — это и утечка IP посетителей третьей стороне, и
 * лишняя точка отказа, из-за которой проверка стала бы неоднозначной
 * (не загрузилось — деплой не доехал или картиночный сервис прилёг?).
 */
import { useEffect, useState } from "react";

type Version = { version?: string; built_at?: string };

/** Варианты мордочки — чтобы котик был каждый раз разный. */
const MOODS = [
  { name: "спокойный", eye: "M0 0 a3 3 0 1 0 0.1 0", mouth: "M-6 6 q6 5 12 0" },
  { name: "довольный", eye: "M-3 0 q3 -4 6 0", mouth: "M-7 5 q7 7 14 0" },
  { name: "хитрый", eye: "M-3 1 q3 -3 6 0", mouth: "M-5 6 q5 3 10 -1" },
  { name: "удивлённый", eye: "M0 0 a3.5 3.5 0 1 0 0.1 0", mouth: "M-3 6 a3 3 0 1 0 6 0" },
];

const COATS = ["#f4a261", "#8d99ae", "#e9c46a", "#b08968", "#adb5bd"];

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export default function DeployCheckCat() {
  const [version, setVersion] = useState<Version | null>(null);
  const [failed, setFailed] = useState(false);
  // Выбираем один раз за монтирование, иначе котик менялся бы на каждый рендер.
  const [look] = useState(() => ({ mood: pick(MOODS), coat: pick(COATS) }));

  useEffect(() => {
    let cancelled = false;
    // Кеш обходим намеренно: устаревший version.json сделал бы проверку
    // бессмысленной — она ведь и нужна, чтобы поймать отдачу старого.
    fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Version) => !cancelled && setVersion(data))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="border-t border-dashed border-border">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <svg width="56" height="56" viewBox="-32 -32 64 64" role="img" aria-label="Котик — временный маркер проверки доставки">
          {/* уши */}
          <path d="M-18 -10 L-22 -26 L-8 -18 Z" fill={look.coat} />
          <path d="M18 -10 L22 -26 L8 -18 Z" fill={look.coat} />
          {/* голова */}
          <circle cx="0" cy="0" r="20" fill={look.coat} />
          {/* глаза */}
          <g fill="none" stroke="#1d3557" strokeWidth="2" strokeLinecap="round">
            <path d={look.mood.eye} transform="translate(-8,-4)" />
            <path d={look.mood.eye} transform="translate(8,-4)" />
            <path d={look.mood.mouth} transform="translate(0,2)" />
          </g>
          {/* нос */}
          <path d="M-2.5 3 L2.5 3 L0 6 Z" fill="#e63946" />
          {/* усы */}
          <g stroke="#1d3557" strokeWidth="1" opacity="0.6" strokeLinecap="round">
            <path d="M-8 8 L-20 6" /><path d="M-8 10 L-20 12" />
            <path d="M8 8 L20 6" /><path d="M8 10 L20 12" />
          </g>
        </svg>

        <div className="space-y-0.5">
          <div>
            Временная проверка доставки. Котик <b>{look.mood.name}</b> — значит браузеру отдан новый JS-бандл.
          </div>
          <div>
            {failed && <span>version.json недоступен</span>}
            {!failed && !version && <span>читаю version.json…</span>}
            {version && (
              <span>
                Коммит в веб-руте: <code className="font-mono">{version.version ?? "—"}</code>
                {version.built_at && <> · собрано {version.built_at}</>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
