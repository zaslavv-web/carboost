import brandLogo from "@/assets/logo-growth-peak.png";
import heroNetwork from "@/assets/deck/hero-network.png";
import SlideLayout from "../SlideLayout";
import { motion } from "framer-motion";
import Editable from "../deck/Editable";
import { Users, LayoutGrid, Flag, Server } from "lucide-react";

const pillars = [
  {
    id: "s1.p1",
    Icon: Users,
    title: "Для компаний от 100 сотрудников",
    text: "Адаптация, развитие, оценка, удержание и аналитика — в одном контуре.",
  },
  {
    id: "s1.p2",
    Icon: LayoutGrid,
    title: "Единое окно сотрудника",
    text: "16 модулей в одной платформе — вместо 5+ систем, без потери эффективности.",
  },
  {
    id: "s1.p3",
    Icon: Flag,
    title: "100% российская разработка",
    text: "Российские ИИ, серверы в РФ, поддержка из России.",
  },
  {
    id: "s1.p4",
    Icon: Server,
    title: "Облако или свой контур",
    text: "Разворачивается в облаке или в контуре компании (Docker / nginx / Kubernetes). Без внешних зависимостей.",
  },
];

export default function Slide1Product() {
  return (
    <SlideLayout kicker="Инвестиционное предложение · 2026" hideWatermark>
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[90px]">
        {/* Бренд */}
        <div className="flex items-center gap-8">
          <motion.img
            src={brandLogo}
            alt="Пик роста"
            initial={{ scale: 0.85, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-[150px] w-[150px] rounded-2xl object-cover shadow-2xl ring-1 ring-[#D5A52A]/30"
          />
          <div className="flex flex-col justify-center">
            <Editable
              id="s1.brand"
              defaultValue="Пик роста"
              as="div"
              className="font-['Instrument_Serif'] text-[96px] leading-[0.95] text-[#1B1D22]"
            />
            <Editable
              id="s1.brand.sub"
              defaultValue="Внутренняя экосистема компании"
              as="div"
              className="mt-1 text-[28px] leading-[1.2] text-[#8C6A1A]"
            />
          </div>
        </div>

        {/* Заголовок + лид */}
        <div className="mt-10">
          <Editable
            id="s1.h1"
            as="h1"
            defaultValue="HR-инфраструктура (поддержка и развитие главного капитала компании)"
            className="max-w-[1650px] font-['Instrument_Serif'] italic text-[64px] leading-[1.05] text-[#1B1D22]"
          />
          <Editable
            id="s1.lead"
            as="p"
            multiline
            defaultValue="Единая кадровая платформа полного цикла: найм, адаптация, карьерные треки, ИИ-оценка, обучение, отпуска, признание. Один продукт вместо 5+ инструментов."
            className="mt-5 max-w-[1200px] text-[26px] leading-[1.35] text-[#1B1D22]/75"
          />
        </div>

        {/* Декоративная иллюстрация */}
        <img
          src={heroNetwork}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute right-[40px] top-[220px] w-[560px] opacity-70"
        />

        {/* 4 карточки 2×2 */}
        <div className="mt-auto grid grid-cols-2 gap-6">
          {pillars.map(({ id, Icon, title, text }, i) => (
            <motion.div
              key={id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
              className="relative rounded-2xl border border-[#D5A52A]/30 bg-white p-7 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-[#D5A52A]/15 text-[#8C6A1A]">
                  <Icon size={30} strokeWidth={1.8} />
                </div>
                <div className="flex-1">
                  <Editable
                    id={`${id}.title`}
                    defaultValue={title}
                    as="div"
                    className="text-[28px] font-semibold leading-[1.15] text-[#1B1D22]"
                  />
                  <Editable
                    id={`${id}.text`}
                    defaultValue={text}
                    as="div"
                    multiline
                    className="mt-2 text-[24px] leading-[1.35] text-[#1B1D22]/75"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>


        {/* Футер */}
        <div className="mt-6 flex items-center justify-between text-[24px] text-[#1B1D22]/60">
          <Editable id="s1.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s1.foot.page" defaultValue="01 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
