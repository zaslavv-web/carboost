import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import { GraduationCap, Trophy, Gamepad2, BarChart3 } from "lucide-react";

const branches = [
  {
    id: "b1",
    Icon: GraduationCap,
    name: "Онлайн-университет",
    leaves: [
      "Онбординг новых сотрудников",
      "Профильное обучение",
      "Обучение новым продуктам",
      "Обязательные курсы и аттестации",
    ],
  },
  {
    id: "b2",
    Icon: Trophy,
    name: "Кадровый резерв",
    leaves: [
      "Карьерные треки",
      "Перформанс-ревью",
      "Рейтинг сотрудника (риски)",
      "План индивидуального развития",
    ],
  },
  {
    id: "b3",
    Icon: Gamepad2,
    name: "Геймификация",
    leaves: [
      "Награды за достижения",
      "Сценарии наград",
      "Магазин наград",
      "Рейтинги и знаки отличия",
    ],
  },
  {
    id: "b4",
    Icon: BarChart3,
    name: "Кадровая аналитика",
    leaves: [
      "Риски по сотрудникам",
      "Текучесть кадров",
      "Индекс комфорта и вовлечённости",
      "Прогноз выгорания",
    ],
  },
];

export default function Slide3ProductTree() {
  return (
    <SlideLayout kicker="Архитектура продукта">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s3.title"
          as="h2"
          defaultValue="Структура платформы"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s3.subtitle"
          as="p"
          multiline
          defaultValue="Базовый модуль — портал компании. Дополнительные модули разделены по категориям. Функционал разбит по категориям"
          className="mt-3 text-[26px] leading-[1.3] text-[#1B1D22]/70"
        />

        {/* Портал компании */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-8 rounded-2xl border-2 border-[#D5A52A] bg-[#D5A52A]/10 px-10 py-6 text-center shadow-md"
        >
          <Editable
            id="s3.root.title"
            defaultValue="Портал компании «Пик роста»"
            as="div"
            className="font-['Instrument_Serif'] text-[40px] text-[#1B1D22]"
          />
          <Editable
            id="s3.root.items"
            defaultValue="Мессенджеры  ·  Новости компании  ·  Таск-трекер"
            as="div"
            className="mt-2 text-[26px] text-[#1B1D22]/80"
          />
        </motion.div>

        {/* 4 колонки-категории */}
        <div className="mt-8 grid flex-1 grid-cols-4 gap-5">
          {branches.map((br, i) => (
            <motion.div
              key={br.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              className="relative flex flex-col rounded-2xl border border-[#D5A52A]/40 bg-white p-5 shadow-sm"
            >
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: "top" }}
                className="absolute -top-6 left-1/2 h-6 w-0.5 -translate-x-1/2 bg-[#D5A52A]/60"
              />
              <Editable
                id={`s3.${br.id}.name`}
                defaultValue={br.name}
                as="div"
                className="text-[28px] font-semibold leading-[1.15] text-[#1B1D22]"
              />
              <ul className="mt-4 space-y-3">
                {br.leaves.map((leaf, j) => (
                  <li
                    key={j}
                    className="flex gap-3 text-[24px] leading-[1.3] text-[#1B1D22]/80"
                  >
                    <span className="mt-3 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                    <Editable id={`s3.${br.id}.leaf.${j}`} defaultValue={leaf} multiline />
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s3.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s3.foot.page" defaultValue="03 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
