import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import peakGrowth from "@/assets/deck/peak-growth.png";
import { Check, Circle } from "lucide-react";

const done = [
  "Портал: мессенджер, новости, таск-трекер",
  "Онбординг и адаптация сотрудников",
  "Карьерные треки и оценка компетенций",
  "Аналитика: риски, комфорт, выгорание",
  "Геймификация: магазин, баллы, знаки",
  "Оргструктура и цифровой паспорт",
  "ИИ-интервью для оценки компетенций",
  "Мультитенантность и 5 ролей",
  "Мобильная версия (веб-приложение)",
];

const todo = [
  "Онлайн-университет: конструктор курсов",
  "Интеграции: 1С:ЗУП, Битрикс24, календари",
  "Расширенная аналитика для совета директоров",
  "Поставка в контуре компании и ИИ на её инфраструктуре",
  "Магазин сценариев оценки и наград",
  "Расширенные рекомендации по устранению рисков",
];

export default function Slide7Status() {
  return (
    <SlideLayout kicker="Статус реализации">
      <div className="relative flex h-full flex-col px-[80px] pt-[110px] pb-[60px]">
        <img
          src={peakGrowth}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute right-[60px] top-[80px] w-[240px] opacity-50"
        />
        <Editable
          id="s7.title"
          as="h2"
          defaultValue="Что уже сделано и что предстоит"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s7.lead"
          as="p"
          multiline
          defaultValue="Ядро платформы в эксплуатации. Инвестиции ускоряют оставшиеся направления."
          className="mt-2 text-[19px] text-[#1B1D22]/70"
        />

        {/* Прогресс с анимированным счётчиком */}
        <div className="mt-5 rounded-2xl border border-[#D5A52A]/40 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[42px] font-bold leading-none text-[#1B1D22] tabular-nums"
            >
              ≈ 60 %
            </motion.div>
            <div className="text-[15px] font-semibold uppercase tracking-[0.18em] text-[#8C6A1A]">
              Готовность продукта
            </div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#D5A52A]/15">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "60%" }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-[#8C6A1A] to-[#D5A52A]"
            />
          </div>
        </div>

        {/* 2 колонки — компактно, с анимированными галочками */}
        <div className="mt-5 grid flex-1 grid-cols-2 gap-5">
          <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-[#D5A52A]/50 bg-white p-5 shadow-sm">
            <Editable
              id="s7.done.title"
              defaultValue="Уже реализовано"
              as="div"
              className="text-[22px] font-semibold text-[#1B1D22]"
            />
            <ul className="mt-3 space-y-2 overflow-hidden">
              {done.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.04, duration: 0.35 }}
                  className="flex items-start gap-3 text-[17px] leading-[1.3] text-[#1B1D22]/85"
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#D5A52A] text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <Editable id={`s7.done.${i}`} defaultValue={r} multiline />
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-[#8C6A1A]/60 bg-[#D5A52A]/5 p-5">
            <Editable
              id="s7.todo.title"
              defaultValue="Предстоит сделать"
              as="div"
              className="text-[22px] font-semibold text-[#1B1D22]"
            />
            <ul className="mt-3 space-y-2 overflow-hidden">
              {todo.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.35 }}
                  className="flex items-start gap-3 text-[17px] leading-[1.3] text-[#1B1D22]/85"
                >
                  <motion.span
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }}
                    className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-[#8C6A1A]"
                  >
                    <Circle size={7} strokeWidth={0} fill="#8C6A1A" className="opacity-70" />
                  </motion.span>
                  <Editable id={`s7.todo.${i}`} defaultValue={r} multiline />
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s7.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s7.foot.page" defaultValue="08 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
