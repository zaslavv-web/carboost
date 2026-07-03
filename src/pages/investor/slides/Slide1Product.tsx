import brandLogo from "@/assets/logo-growth-peak.png";
import SlideLayout from "../SlideLayout";
import { Building2, LayoutDashboard, ShieldCheck, Cloud } from "lucide-react";

const pillars = [
  {
    icon: Building2,
    title: "HRD и HRBP от 200 сотрудников",
    text: "Закрывает ключевые задачи HR-функции среднего и крупного бизнеса: адаптация, развитие, оценка, удержание, аналитика.",
  },
  {
    icon: LayoutDashboard,
    title: "Одно окно для сотрудника",
    text: "16 модулей в единой платформе. Сотрудник работает каждый день из одного интерфейса — вместо 5+ разрозненных сервисов.",
  },
  {
    icon: ShieldCheck,
    title: "100% российская разработка",
    text: "Реестр отечественного ПО. Работает с российскими AI (YandexGPT, GigaChat) и с зарубежными моделями через OpenAI-совместимый API.",
  },
  {
    icon: Cloud,
    title: "Облако или on-premise",
    text: "Разворачивается в облаке или в информационном контуре компании (Docker / nginx / Kubernetes). Без внешних SaaS-зависимостей.",
  },
];

export default function Slide1Product() {
  return (
    <SlideLayout kicker="Инвестиционное предложение · 2026">
      <div className="flex h-full flex-col px-24 pt-28 pb-16">
        <div className="flex items-center gap-6">
          <img src={brandLogo} alt="Пик роста" className="h-20 w-20 rounded-2xl object-cover shadow-2xl" />
          <div>
            <div className="font-['Instrument_Serif'] text-[72px] leading-none text-[#F5F1E8]">Пик роста</div>
            <div className="mt-2 text-[22px] text-[#D5A52A]">Career Track OS · v2.0</div>
          </div>
        </div>

        <h1 className="mt-14 max-w-[1500px] font-['Instrument_Serif'] text-[96px] leading-[1.02] text-[#F5F1E8]">
          Операционная <span className="italic text-[#D5A52A]">система</span> карьеры и людей
        </h1>
        <p className="mt-6 max-w-[1400px] text-[28px] leading-[1.35] text-[#F5F1E8]/80">
          Единая HR-tech ОС полного цикла: от найма и адаптации — до карьерных треков, AI-оценки,
          перфоманса, обучения, отпусков и признания. Один продукт вместо 5+ инструментов.
        </p>

        <div className="mt-auto grid grid-cols-4 gap-6">
          {pillars.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D5A52A]/15 text-[#D5A52A]">
                <Icon className="h-6 w-6" />
              </div>
              <div className="mt-4 text-[22px] font-semibold text-[#F5F1E8]">{title}</div>
              <div className="mt-2 text-[16px] leading-[1.4] text-[#F5F1E8]/65">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
