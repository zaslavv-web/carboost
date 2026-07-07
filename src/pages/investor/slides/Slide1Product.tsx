import brandLogo from "@/assets/logo-growth-peak.png";
import heroImg from "@/assets/deck/slide1-dashboard.jpg";
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
    text: "Разворачивается в облаке или в контуре компании (Docker / nginx / Kubernetes).",
  },
];

export default function Slide1Product() {
  return (
    <SlideLayout kicker="Инвестиционное предложение · 2026" hideWatermark>
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[70px]">
        {/* Верхняя сетка: слева бренд+текст, справа изображение */}
        <div className="grid grid-cols-[1.35fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-6">
              <motion.img
                src={brandLogo}
                alt="Пик роста"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="h-[120px] w-[120px] rounded-2xl object-cover shadow-2xl ring-1 ring-[#D5A52A]/30"
              />
              <div>
                <Editable
                  id="s1.brand"
                  defaultValue="Пик роста"
                  as="div"
                  className="text-[76px] font-bold leading-[0.95] text-[#1B1D22]"
                />
                <Editable
                  id="s1.brand.sub"
                  defaultValue="Внутренняя экосистема компании"
                  as="div"
                  className="mt-1 text-[22px] font-medium text-[#8C6A1A]"
                />
              </div>
            </div>

            <Editable
              id="s1.h1"
              as="h1"
              defaultValue="HR-инфраструктура — поддержка и развитие главного капитала"
              className="mt-8 text-[48px] font-bold leading-[1.08] text-[#1B1D22]"
            />
            <Editable
              id="s1.lead"
              as="p"
              multiline
              defaultValue="Единая кадровая платформа полного цикла: найм, адаптация, карьерные треки, ИИ-оценка, обучение, отпуска, признание — вместо 5+ инструментов."
              className="mt-4 text-[22px] leading-[1.35] text-[#1B1D22]/75"
            />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-2xl border border-[#D5A52A]/30 bg-white shadow-2xl ring-1 ring-black/5"
          >
            <img src={heroImg} alt="Дашборд HRD" className="h-full w-full object-cover" />
          </motion.div>
        </div>

        {/* 4 карточки 2×2 */}
        <div className="mt-auto grid grid-cols-2 gap-5">
          {pillars.map(({ id, Icon, title, text }, i) => (
            <motion.div
              key={id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
              className="rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-[#D5A52A]/15 text-[#8C6A1A]">
                  <Icon size={26} strokeWidth={1.8} />
                </div>
                <div className="flex-1">
                  <Editable
                    id={`${id}.title`}
                    defaultValue={title}
                    as="div"
                    className="text-[22px] font-semibold leading-[1.2] text-[#1B1D22]"
                  />
                  <Editable
                    id={`${id}.text`}
                    defaultValue={text}
                    as="div"
                    multiline
                    className="mt-2 text-[18px] leading-[1.35] text-[#1B1D22]/75"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between text-[18px] text-[#1B1D22]/60">
          <Editable id="s1.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s1.foot.page" defaultValue="01 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
