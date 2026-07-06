import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";

const cards = [
  {
    id: "s4.why",
    title: "Зачем ИИ",
    items: [
      "Разбор кадровых документов и оргструктуры (PDF/DOCX/XLSX → структура)",
      "Генерация карьерных треков, тестов, сценариев оценки под должность",
      "Ассистент оценки компетенций (структурированный диалог)",
      "Расчёт рисков по сотрудникам и рекомендаций для директора по персоналу",
      "Умный поиск по базе знаний и ответы ассистента со ссылками",
    ],
  },
  {
    id: "s4.no",
    title: "Что если ИИ отключить",
    items: [
      "Ядро продукта работает: порталы, треки, обучение, задачи, аналитика по фактам",
      "Отключаются: авто-генерация треков, тестов, оценка через ИИ, умный поиск",
      "Работают ручные шаблоны и импорт из XLSX — процесс дольше, но не блокируется",
      "В админке ИИ включается/выключается по компании и по модулю",
    ],
  },
  {
    id: "s4.on",
    title: "Установка в контуре компании",
    items: [
      "Полная установка в контуре: браузер + сервер приложений + БД + кэш",
      "ИИ подключается к любой совместимой модели внутри периметра (vLLM, Ollama)",
      "Пример: AI_API_URL=http://vllm.internal:8000/v1/chat/completions",
      "Docker Compose · nginx · Kubernetes · без внешних облачных зависимостей",
    ],
  },
  {
    id: "s4.pr",
    title: "Провайдеры ИИ",
    items: [
      "YandexGPT · GigaChat (Сбер) — РФ, облако",
      "vLLM / Ollama — в контуре, открытый код",
      "Внутренний умный поиск — корпоративная модель",
      "GPT-4o · OpenRouter — совместимый интерфейс",
    ],
  },
];

export default function Slide4AI() {
  return (
    <SlideLayout kicker="ИИ под капотом">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
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
              className="rounded-2xl border border-[#D5A52A]/30 bg-white p-7 shadow-sm"
            >
              <Editable
                id={`${c.id}.title`}
                defaultValue={c.title}
                as="div"
                className="text-[30px] font-semibold text-[#1B1D22]"
              />
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
