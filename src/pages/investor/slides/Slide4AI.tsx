import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { Brain, PowerOff, Server, Sparkles } from "lucide-react";

const whyAi = [
  { id: "s4.why.0", text: "Разбор кадровых документов и оргструктуры (PDF/DOCX/XLSX → структурированные данные)" },
  { id: "s4.why.1", text: "Генерация карьерных треков, тестов, сценариев оценки под должность" },
  { id: "s4.why.2", text: "Ассистент оценки компетенций (структурированный диалог вместо 4-часового интервью)" },
  { id: "s4.why.3", text: "Расчёт рисков по сотрудникам и рекомендаций для директора по персоналу" },
  { id: "s4.why.4", text: "Умный поиск по базе знаний и ответы ассистента со ссылками на источники" },
];

const withoutAi = [
  { id: "s4.no.0", text: "Ядро продукта работает: порталы, треки, обучение, задачи, аналитика по фактам" },
  { id: "s4.no.1", text: "Отключаются: авто-генерация треков и тестов, оценка через ИИ, умный поиск, авто-разбор" },
  { id: "s4.no.2", text: "Работают ручные шаблоны и импорт из XLSX — процесс дольше, но не блокируется" },
];

const providers = [
  { id: "s4.pr.0", name: "YandexGPT", tag: "РФ · облако" },
  { id: "s4.pr.1", name: "GigaChat (Сбер)", tag: "РФ · облако" },
  { id: "s4.pr.2", name: "vLLM / Ollama", tag: "В контуре · открытый код" },
  { id: "s4.pr.3", name: "Внутренний умный поиск", tag: "В контуре · корп. модель" },
  { id: "s4.pr.4", name: "GPT-4o", tag: "Совместимый интерфейс" },
  { id: "s4.pr.5", name: "OpenRouter", tag: "Любая совместимая модель" },
];

export default function Slide4AI() {
  return (
    <SlideLayout kicker="ИИ под капотом">
      <div className="grid h-full grid-cols-12 gap-6 px-16 pt-28 pb-14">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[60px] leading-none text-[#1B1D22]">
            <Editable id="s4.h1.a" defaultValue="ИИ — " />
            <span className="italic text-[#8C6A1A]"><Editable id="s4.h1.b" defaultValue="ускоритель" /></span>
            <Editable id="s4.h1.c" defaultValue=", а не костыль" />
          </h2>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-[#8C6A1A]" />
            <Editable id="s4.why.title" defaultValue="Зачем ИИ" as="div"
              className="text-[22px] font-semibold text-[#1B1D22]" />
          </div>
          <ul className="mt-3 space-y-2">
            {whyAi.map((r) => (
              <li key={r.id} className="flex gap-3 text-[16px] leading-[1.4] text-[#1B1D22]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                <Editable id={r.id} defaultValue={r.text} multiline />
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <PowerOff className="h-6 w-6 text-[#8C6A1A]" />
            <Editable id="s4.no.title" defaultValue="Что если ИИ отключить" as="div"
              className="text-[22px] font-semibold text-[#1B1D22]" />
          </div>
          <ul className="mt-3 space-y-2">
            {withoutAi.map((r) => (
              <li key={r.id} className="flex gap-3 text-[16px] leading-[1.4] text-[#1B1D22]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                <Editable id={r.id} defaultValue={r.text} multiline />
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg border border-[#D5A52A]/40 bg-[#D5A52A]/10 p-3 text-[14px] text-[#1B1D22]/80">
            <Editable id="s4.no.note" multiline
              defaultValue="В админке ИИ можно включать и выключать по компании и по модулю. Юридически безопасный режим — без внешних вызовов." />
          </div>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Server className="h-6 w-6 text-[#8C6A1A]" />
            <Editable id="s4.on.title" defaultValue="Установка в контуре компании" as="div"
              className="text-[22px] font-semibold text-[#1B1D22]" />
          </div>
          <Editable id="s4.on.text" as="p" multiline
            defaultValue="Полная установка в контуре компании: браузерное приложение + сервер приложений + база данных + кэш. ИИ подключается к любой совместимой модели внутри периметра — vLLM, Ollama, корпоративный шлюз."
            className="mt-3 text-[16px] leading-[1.4] text-[#1B1D22]/85" />
          <pre className="mt-3 overflow-hidden rounded-lg bg-[#1B1D22] p-3 font-mono text-[13px] leading-[1.5] text-[#F5F1E8]">
{`AI_API_URL=http://vllm.internal:8000/v1/chat/completions
AI_API_KEY=***
AI_MODEL=qwen2.5-32b-instruct`}
          </pre>
          <Editable id="s4.on.foot" as="div"
            defaultValue="Docker Compose · nginx · Kubernetes · без внешних облачных зависимостей."
            className="mt-2 text-[13px] text-[#1B1D22]/60" />
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-[#8C6A1A]" />
            <Editable id="s4.pr.title" defaultValue="Провайдеры ИИ" as="div"
              className="text-[22px] font-semibold text-[#1B1D22]" />
          </div>
          <Editable id="s4.pr.sub" as="p" multiline
            defaultValue="Переключаются в один клик из админки. Ключи хранятся зашифрованно, доступ — по компании."
            className="mt-2 text-[15px] text-[#1B1D22]/70" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {providers.map((p) => (
              <div key={p.id} className="rounded-lg border border-[#D5A52A]/30 bg-[#F7F4EC] px-4 py-3">
                <Editable id={`${p.id}.name`} defaultValue={p.name} as="div"
                  className="text-[17px] font-semibold text-[#1B1D22]" />
                <Editable id={`${p.id}.tag`} defaultValue={p.tag} as="div"
                  className="text-[12px] uppercase tracking-widest text-[#8C6A1A]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
