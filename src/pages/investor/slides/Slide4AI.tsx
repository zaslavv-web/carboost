import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import aiAbstract from "@/assets/deck/ai-abstract.png";
import { Sparkles, PowerOff, Server, Cpu } from "lucide-react";

const cards = [
  {
    id: "s4.why",
    Icon: Sparkles,
    title: "Зачем ИИ",
    items: [
      "Разбор кадровых документов и оргструктуры (PDF/DOCX/XLSX)",
      "Генерация карьерных треков, тестов, сценариев оценки",
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
      "Ядро работает: порталы, треки, обучение, задачи, аналитика",
      "Отключаются: авто-генерация треков, тестов, ИИ-оценка, умный поиск",
      "Работают ручные шаблоны и импорт XLSX — дольше, но не блокируется",
      "В админке ИИ включается по компании и модулю",
    ],
  },
  {
    id: "s4.on",
    Icon: Server,
    title: "Установка в контуре компании",
    items: [
      "Полная установка в контуре: браузер + сервер + БД + кэш",
      "ИИ — любая совместимая модель внутри периметра (vLLM, Ollama)",
      "Пример: AI_API_URL=http://vllm.internal:8000/v1/…",
      "Docker · nginx · Kubernetes · без внешних зависимостей",
    ],
  },
  {
    id: "s4.pr",
    Icon: Cpu,
    title: "Провайдеры ИИ",
    items: [
      "YandexGPT · GigaChat — РФ, облако",
      "vLLM / Ollama — в контуре, open source",
      "Внутренний умный поиск — корпоративная модель",
      "GPT-4o · OpenRouter — совместимый API",
    ],
  },
];

export default function Slide4AI() {
  return (
    <SlideLayout kicker="ИИ под капотом">
      <div className="relative flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <img
          src={aiAbstract}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute right-[60px] top-[60px] w-[420px] opacity-60"
        />

        <Editable
          id="s4.title"
          as="h2"
          defaultValue="ИИ — ускоритель, а не костыль"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />

        <div className="mt-8 grid flex-1 grid-cols-2 grid-rows-2 gap-6">
          {cards.map((c) => (
            <div
              key={c.id}
              className="relative rounded-2xl border border-[#D5A52A]/30 bg-white p-7 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-[#D5A52A]/15 text-[#8C6A1A]">
                  <c.Icon size={26} strokeWidth={1.8} />
                </div>
                <Editable
                  id={`${c.id}.title`}
                  defaultValue={c.title}
                  as="div"
                  className="text-[30px] font-semibold text-[#1B1D22]"
                />
              </div>
              <ul className="mt-4 space-y-2.5">
                {c.items.map((it, j) => (
                  <li
                    key={j}
                    className="flex gap-3 text-[24px] leading-[1.3] text-[#1B1D22]/85"
                  >
                    <span className="mt-3 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                    <Editable id={`${c.id}.item.${j}`} defaultValue={it} multiline />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s4.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s4.foot.page" defaultValue="04 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
