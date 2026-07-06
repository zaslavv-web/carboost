import brandLogo from "@/assets/logo-growth-peak.png";
import SlideLayout from "../SlideLayout";
import { Building2, LayoutDashboard, ShieldCheck, Cloud } from "lucide-react";
import { motion } from "framer-motion";
import Editable from "../deck/Editable";

const pillars = [
  { id: "s1.p1", icon: Building2, title: "Для компаний со 100+ сотрудников",
    text: "Средний и крупный бизнес: адаптация, развитие, оценка, удержание, аналитика — в одном контуре." },
  { id: "s1.p2", icon: LayoutDashboard, title: "Одно окно для сотрудника",
    text: "16 модулей в единой платформе. Сотрудник работает каждый день из одного интерфейса — вместо 5+ разрозненных сервисов." },
  { id: "s1.p3", icon: ShieldCheck, title: "100% российская разработка",
    text: "Реестр отечественного ПО. Работает с российскими ИИ (YandexGPT, GigaChat) и с зарубежными моделями через совместимый программный интерфейс." },
  { id: "s1.p4", icon: Cloud, title: "Облако или установка в контуре",
    text: "Разворачивается в облаке или в информационном контуре компании (Docker / nginx / Kubernetes). Без внешних облачных зависимостей." },
];

export default function Slide1Product() {
  return (
    <SlideLayout kicker="Инвестиционное предложение · 2026" hideWatermark>
      <div className="flex h-full flex-col px-16 pt-24 pb-10">
        <div className="flex items-center gap-6">
          <motion.img
            src={brandLogo}
            alt="Пик роста"
            initial={{ scale: 0.85, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-24 w-24 rounded-2xl object-cover shadow-2xl ring-1 ring-[#D5A52A]/30"
          />
          <div className="flex flex-col justify-center">
            <Editable id="s1.brand" defaultValue="Пик роста" as="div"
              className="font-['Instrument_Serif'] text-[48px] leading-[1] text-[#1B1D22]" />
            <Editable id="s1.brand.sub" defaultValue="Внутренняя экосистема жизни компании: обучение, люди, задачи, мотивация, кадровая аналитика" as="div"
              className="mt-2 max-w-[1100px] text-[20px] leading-[1.2] text-[#8C6A1A]" />
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="max-w-[1300px] font-['Instrument_Serif'] text-[48px] leading-[1.02] text-[#1B1D22]">
            <Editable id="s1.h1.a" defaultValue="Операционная " />
            <span className="italic text-[#8C6A1A]">
              <Editable id="s1.h1.b" defaultValue="система" />
            </span>
            <Editable id="s1.h1.c" defaultValue=" карьеры и людей" />
          </h1>
          <Editable id="s1.lead" as="p" multiline
            defaultValue="Единая кадровая платформа полного цикла: от найма и адаптации — до карьерных треков, оценки с помощью ИИ, оценки эффективности, обучения, отпусков и признания. Один продукт вместо 5+ инструментов."
            className="mt-4 max-w-[1200px] text-[20px] leading-[1.35] text-[#1B1D22]/75" />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {pillars.map(({ id, icon: Icon, title, text }, i) => (
            <motion.div
              key={id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
              className="rounded-2xl border border-[#D5A52A]/30 bg-white p-8 shadow-sm"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D5A52A]/20 text-[#8C6A1A]">
                <Icon className="h-8 w-8" />
              </div>
              <Editable id={`${id}.title`} defaultValue={title} as="div"
                className="mt-5 text-[24px] font-semibold leading-[1.15] text-[#1B1D22]" />
              <Editable id={`${id}.text`} defaultValue={text} as="div" multiline
                className="mt-2 text-[16px] leading-[1.4] text-[#1B1D22]/70" />
            </motion.div>
          ))}
        </div>
      </div>
    </SlideLayout>
  );
}
