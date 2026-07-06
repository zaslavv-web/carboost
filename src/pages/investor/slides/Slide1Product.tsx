import brandLogo from "@/assets/logo-growth-peak.png";
import SlideLayout from "../SlideLayout";
import { Building2, LayoutDashboard, ShieldCheck, Cloud } from "lucide-react";
import { motion } from "framer-motion";
import Editable from "../deck/Editable";

const pillars = [
  { id: "s1.p1", icon: Building2, title: "Для компаний с 200+ сотрудников",
    text: "Средний и крупный бизнес: адаптация, развитие, оценка, удержание, аналитика — в одном контуре." },
  { id: "s1.p2", icon: LayoutDashboard, title: "Одно окно для сотрудника",
    text: "16 модулей в единой платформе. Сотрудник работает каждый день из одного интерфейса — вместо 5+ разрозненных сервисов." },
  { id: "s1.p3", icon: ShieldCheck, title: "100% российская разработка",
    text: "Реестр отечественного ПО. Работает с российскими AI (YandexGPT, GigaChat) и с зарубежными моделями через OpenAI-совместимый API." },
  { id: "s1.p4", icon: Cloud, title: "Облако или on-premise",
    text: "Разворачивается в облаке или в информационном контуре компании (Docker / nginx / Kubernetes). Без внешних SaaS-зависимостей." },
];

export default function Slide1Product() {
  return (
    <SlideLayout kicker="Инвестиционное предложение · 2026" hideWatermark>
      <div className="flex h-full flex-col px-24 pt-28 pb-16">
        <div className="flex items-center gap-8">
          <motion.img
            src={brandLogo}
            alt="Пик роста"
            initial={{ scale: 0.85, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-36 w-36 rounded-2xl object-cover shadow-2xl ring-1 ring-[#D5A52A]/30"
          />
          <div className="flex flex-col justify-center">
            <Editable id="s1.brand" defaultValue="Пик роста" as="div"
              className="font-['Instrument_Serif'] text-[60px] leading-[1] text-[#F5F1E8]" />
            <Editable id="s1.brand.sub" defaultValue="Внутренняя экосистема жизни компании: обучение, люди, задачи, мотивация, HR-аналитика" as="div"
              className="mt-3 max-w-[1200px] text-[26px] leading-[1.2] text-[#D5A52A]" />
          </div>
        </div>

        <h1 className="mt-16 max-w-[1500px] font-['Instrument_Serif'] text-[60px] leading-[1.02] text-[#F5F1E8]">
          <Editable id="s1.h1.a" defaultValue="Операционная " />
          <span className="italic text-[#D5A52A]">
            <Editable id="s1.h1.b" defaultValue="система" />
          </span>
          <Editable id="s1.h1.c" defaultValue=" карьеры и людей" />
        </h1>
        <Editable id="s1.lead" as="p" multiline
          defaultValue="Единая HR-tech ОС полного цикла: от найма и адаптации — до карьерных треков, AI-оценки, перфоманса, обучения, отпусков и признания. Один продукт вместо 5+ инструментов."
          className="mt-6 max-w-[1400px] text-[26px] leading-[1.35] text-[#F5F1E8]/80" />

        <div className="mt-auto grid grid-cols-4 gap-6">
          {pillars.map(({ id, icon: Icon, title, text }, i) => (
            <motion.div
              key={id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
              className="rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D5A52A]/15 text-[#D5A52A]">
                <Icon className="h-6 w-6" />
              </div>
              <Editable id={`${id}.title`} defaultValue={title} as="div"
                className="mt-4 text-[22px] font-semibold text-[#F5F1E8]" />
              <Editable id={`${id}.text`} defaultValue={text} as="div" multiline
                className="mt-2 text-[16px] leading-[1.4] text-[#F5F1E8]/65" />
            </motion.div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
