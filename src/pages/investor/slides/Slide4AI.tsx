import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import aiImg from "@/assets/deck/slide4-ai.png";
import aiAbstract from "@/assets/deck/ai-abstract.png";
import { Sparkles, PowerOff, Server, Cpu } from "lucide-react";

const cards = [
  {
    id: "s4.why",
    Icon: Sparkles,
    title: "Зачем ИИ",
    items: [
      "Разбор кадровых документов и оргструктуры",
      "Генерация треков, тестов, сценариев оценки",
      "Ассистент оценки компетенций",
      "Расчёт рисков и рекомендаций для HRD",
      "Умный поиск по базе знаний со ссылками",
    ],
  },
  {
    id: "s4.no",
    Icon: PowerOff,
    title: "Что если ИИ отключить",
    items: [
      "Ядро работает: порталы, треки, обучение, аналитика",
      "Отключаются: авто-генерация, ИИ-оценка, умный поиск",
      "Ручные шаблоны и импорт XLSX — дольше, но не блок",
      "В админке ИИ включается по компании и модулю",
    ],
  },
  {
    id: "s4.on",
    Icon: Server,
    title: "Установка в контуре",
    items: [
      "Полная установка: браузер + сервер + БД + кэш",
      "ИИ — любая совместимая модель (vLLM, Ollama)",
      "Пример: AI_API_URL=http://vllm.internal:8000/v1/",
      "Docker · nginx · Kubernetes — без внешних зависимостей",
    ],
  },
  {
    id: "s4.pr",
    Icon: Cpu,
    title: "Провайдеры ИИ",
    items: [
      "YandexGPT · GigaChat — РФ, облако",
      "vLLM · Ollama — open source, в контуре",
      "Внутренний умный поиск — корпоративная модель",
      "GPT-4o · OpenRouter — совместимый API",
    ],
  },
];

export default function Slide4AI() {
  return (
    <SlideLayout kicker="ИИ под капотом">
      <div className="relative flex h-full flex-col px-[90px] pt-[110px] pb-[65px]">
        <img
          src={aiImg}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute right-[60px] top-[70px] w-[280px] opacity-70"
        />
        <img
          src={aiAbstract}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute right-[340px] top-[90px] w-[200px] opacity-40"
        />

        <Editable
          id="s4.title"
          as="h2"
          defaultValue="ИИ — ускоритель, а не костыль"
          className="text-[48px] font-bold leading-[1.05] text-[#1B1D22]"
        />

        <div className="mt-6 grid flex-1 grid-cols-2 grid-rows-2 gap-5">
          {cards.map((c) => (
            <div
              key={c.id}
              className="relative rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-[#D5A52A]/15 text-[#8C6A1A]">
                  <c.Icon size={22} strokeWidth={1.8} />
                </div>
                <Editable
                  id={`${c.id}.title`}
                  defaultValue={c.title}
                  as="div"
                  className="text-[23px] font-semibold text-[#1B1D22]"
                />
              </div>
              <ul className="mt-3 space-y-2">
                {c.items.map((it, j) => (
                  <li
                    key={j}
                    className="flex gap-3 text-[18px] leading-[1.3] text-[#1B1D22]/85"
                  >
                    <span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                    <Editable id={`${c.id}.item.${j}`} defaultValue={it} multiline />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s4.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s4.foot.page" defaultValue="04 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
