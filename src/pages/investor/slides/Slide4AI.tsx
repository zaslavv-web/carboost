import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { Brain, PowerOff, Server, Sparkles } from "lucide-react";

const whyAi = [
  "Парсинг HR-документов и оргструктуры (PDF/DOCX/XLSX → структурированные данные)",
  "Генерация карьерных треков, тестов, сценариев оценки под должность",
  "AI-ассистент оценки компетенций (структурированный диалог вместо 4-часового интервью)",
  "Расчёт риск-скоров сотрудников и рекомендаций для HRD",
  "Умный поиск по базе знаний (RAG) и ответы ассистента с источниками",
];

const withoutAi = [
  "Ядро продукта работает: порталы, треки, LMS, tracker, аналитика по фактам",
  "Отключаются: авто-генерация треков/тестов, AI-оценка, RAG-ассистент, авто-парсинг",
  "Работают ручные шаблоны и импорт из XLSX — процесс дольше, но не блокируется",
];

const providers = [
  { name: "YandexGPT", tag: "РФ · SaaS" },
  { name: "GigaChat (Сбер)", tag: "РФ · SaaS" },
  { name: "vLLM / Ollama", tag: "On-prem · open-source" },
  { name: "Внутренний RAG", tag: "On-prem · корп. модель" },
  { name: "OpenAI / GPT-4o", tag: "OpenAI-API" },
  { name: "OpenRouter", tag: "любой OpenAI-совм." },
];

export default function Slide4AI() {
  return (
    <SlideLayout kicker="AI под капотом">
      <div className="grid h-full grid-cols-12 gap-6 px-16 pt-28 pb-14">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[60px] leading-none text-[#F5F1E8]">
            <Editable id="s4.h1.a" defaultValue="AI — " />
            <span className="italic text-[#D5A52A]"><Editable id="s4.h1.b" defaultValue="ускоритель" /></span>
            <Editable id="s4.h1.c" defaultValue=", а не костыль" />
          </h2>

        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-[#D5A52A]" />
            <div className="text-[22px] font-semibold text-[#F5F1E8]">Зачем AI</div>
          </div>
          <ul className="mt-3 space-y-2">
            {whyAi.map((t, i) => (
              <li key={i} className="flex gap-3 text-[16px] leading-[1.4] text-[#F5F1E8]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-center gap-3">
            <PowerOff className="h-6 w-6 text-[#D5A52A]" />
            <div className="text-[22px] font-semibold text-[#F5F1E8]">Что если AI отключить</div>
          </div>
          <ul className="mt-3 space-y-2">
            {withoutAi.map((t, i) => (
              <li key={i} className="flex gap-3 text-[16px] leading-[1.4] text-[#F5F1E8]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg border border-[#D5A52A]/40 bg-[#1B1D22] p-3 text-[14px] text-[#F5F1E8]/75">
            В админке AI можно включать/выключать по компании и по модулю. Юр.-безопасный режим — без внешних вызовов.
          </div>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-center gap-3">
            <Server className="h-6 w-6 text-[#D5A52A]" />
            <div className="text-[22px] font-semibold text-[#F5F1E8]">On-premise</div>
          </div>
          <p className="mt-3 text-[16px] leading-[1.4] text-[#F5F1E8]/85">
            Полная установка в контуре компании: React SPA + Laravel + PostgreSQL + Redis. AI подключается
            к любому OpenAI-совместимому endpoint внутри периметра — vLLM, Ollama, корпоративный gateway.
          </p>
          <pre className="mt-3 overflow-hidden rounded-lg bg-[#1B1D22] p-3 font-mono text-[13px] leading-[1.5] text-[#F5F1E8]/80">
{`AI_API_URL=http://vllm.internal:8000/v1/chat/completions
AI_API_KEY=***
AI_MODEL=qwen2.5-32b-instruct`}
          </pre>
          <div className="mt-2 text-[13px] text-[#F5F1E8]/55">
            Docker Compose · nginx · Kubernetes · без внешних SaaS-зависимостей.
          </div>
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-[#D5A52A]" />
            <div className="text-[22px] font-semibold text-[#F5F1E8]">Провайдеры AI</div>
          </div>
          <p className="mt-2 text-[15px] text-[#F5F1E8]/70">
            Переключаются в один клик из админки. Ключи хранятся зашифрованно, скоуп — на компанию.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {providers.map((p) => (
              <div
                key={p.name}
                className="rounded-lg border border-[#D5A52A]/25 bg-[#1B1D22] px-4 py-3"
              >
                <div className="text-[17px] font-semibold text-[#F5F1E8]">{p.name}</div>
                <div className="text-[12px] uppercase tracking-widest text-[#D5A52A]">{p.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
