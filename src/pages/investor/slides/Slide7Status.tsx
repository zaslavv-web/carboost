import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import peakGrowth from "@/assets/deck/peak-growth.png";

const done = [
  "Портал: мессенджер, новости, таск-трекер",
  "Онбординг и адаптация сотрудников",
  "Карьерные треки и оценка компетенций",
  "Аналитика: риски, комфорт, выгорание",
  "Геймификация: магазин, баллы, знаки отличия",
  "Оргструктура и цифровой паспорт сотрудника",
  "ИИ-интервью для оценки компетенций",
  "Мультитенантность и 5 ролей пользователей",
  "Мобильная версия (веб-приложение)",
];

const todo = [
  "Онлайн-университет: конструктор курсов",
  "Интеграции: 1С:ЗУП, Битрикс24, календари",
  "Расширенная аналитика для совета директоров",
  "Поставка в контуре компании и ИИ на её инфраструктуре",
  "Магазин сценариев оценки и наград",
  "Расширенная оценка рисков и рекомендации по устранению",
];

export default function Slide7Status() {
  return (
    <SlideLayout kicker="Статус реализации">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s7.title"
          as="h2"
          defaultValue="Что уже сделано и что предстоит"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s7.lead"
          as="p"
          multiline
          defaultValue="Ядро платформы в промышленной эксплуатации. Инвестиции ускоряют оставшиеся направления."
          className="mt-3 text-[26px] text-[#1B1D22]/70"
        />

        {/* Прогресс */}
        <div className="mt-6 rounded-2xl border border-[#D5A52A]/40 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <Editable
              id="s7.progress.value"
              defaultValue="≈ 60%"
              as="div"
              className="font-['Instrument_Serif'] text-[56px] leading-none text-[#1B1D22]"
            />
            <Editable
              id="s7.progress.label"
              defaultValue="ГОТОВНОСТЬ ПРОДУКТА"
              as="div"
              className="text-[24px] uppercase tracking-widest text-[#8C6A1A]"
            />
          </div>
          <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-[#D5A52A]/15">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "60%" }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-[#8C6A1A] to-[#D5A52A]"
            />
          </div>
        </div>

        {/* 2 колонки */}
        <div className="mt-6 grid flex-1 grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-[#D5A52A]/50 bg-white p-6 shadow-sm">
            <Editable
              id="s7.done.title"
              defaultValue="✓  Уже реализовано"
              as="div"
              className="text-[30px] font-semibold text-[#1B1D22]"
            />
            <ul className="mt-4 space-y-2.5">
              {done.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-[24px] leading-[1.3] text-[#1B1D22]/85"
                >
                  <span className="mt-3 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                  <Editable id={`s7.done.${i}`} defaultValue={r} multiline />
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-[#8C6A1A]/60 bg-[#D5A52A]/5 p-6">
            <Editable
              id="s7.todo.title"
              defaultValue="⌛  Предстоит сделать"
              as="div"
              className="text-[30px] font-semibold text-[#1B1D22]"
            />
            <ul className="mt-4 space-y-2.5">
              {todo.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-[24px] leading-[1.3] text-[#1B1D22]/85"
                >
                  <span className="mt-3 h-2 w-2 flex-none rounded-full border-2 border-[#8C6A1A]" />
                  <Editable id={`s7.todo.${i}`} defaultValue={r} multiline />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s7.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s7.foot.page" defaultValue="08 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
