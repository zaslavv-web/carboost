import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Trophy,
  Gamepad2,
  BarChart3,
  Building2,
  BookOpen,
  Award,
  ClipboardList,
  Target,
  Route,
  Gift,
  Store,
  Star,
  ShieldAlert,
  Activity,
  Flame,
  Users,
} from "lucide-react";

const branches = [
  {
    id: "b1",
    Icon: GraduationCap,
    name: "Онлайн-университет",
    leaves: [
      { i: BookOpen, t: "Онбординг новых сотрудников" },
      { i: GraduationCap, t: "Профильное обучение" },
      { i: Award, t: "Обучение новым продуктам" },
      { i: ClipboardList, t: "Обязательные курсы и аттестации" },
    ],
  },
  {
    id: "b2",
    Icon: Trophy,
    name: "Кадровый резерв",
    leaves: [
      { i: Route, t: "Карьерные треки" },
      { i: Target, t: "Перформанс-ревью" },
      { i: ShieldAlert, t: "Рейтинг сотрудника (риски)" },
      { i: ClipboardList, t: "План индивидуального развития" },
    ],
  },
  {
    id: "b3",
    Icon: Gamepad2,
    name: "Геймификация",
    leaves: [
      { i: Gift, t: "Награды за достижения" },
      { i: ClipboardList, t: "Сценарии наград" },
      { i: Store, t: "Магазин наград" },
      { i: Star, t: "Рейтинги и знаки отличия" },
    ],
  },
  {
    id: "b4",
    Icon: BarChart3,
    name: "Кадровая аналитика",
    leaves: [
      { i: ShieldAlert, t: "Риски по сотрудникам" },
      { i: Users, t: "Текучесть кадров" },
      { i: Activity, t: "Индекс комфорта и вовлечённости" },
      { i: Flame, t: "Прогноз выгорания" },
    ],
  },
];

export default function Slide3ProductTree() {
  return (
    <SlideLayout kicker="Архитектура продукта">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[70px]">
        <Editable
          id="s3.title"
          as="h2"
          defaultValue="Структура платформы"
          className="text-[48px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s3.subtitle"
          as="p"
          multiline
          defaultValue="Базовый модуль — портал компании. Дополнительные модули разделены по категориям."
          className="mt-2 text-[20px] leading-[1.3] text-[#1B1D22]/70"
        />

        {/* Портал компании */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-6 flex items-center justify-center gap-4 rounded-2xl border-2 border-[#D5A52A] bg-[#D5A52A]/10 px-10 py-5 text-center shadow-md"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/70 text-[#8C6A1A]">
            <Building2 size={32} strokeWidth={1.8} />
          </div>
          <div className="text-left">
            <Editable
              id="s3.root.title"
              defaultValue="Портал компании «Пик роста»"
              as="div"
              className="text-[28px] font-bold text-[#1B1D22]"
            />
            <Editable
              id="s3.root.items"
              defaultValue="Мессенджеры  ·  Новости компании  ·  Таск-трекер"
              as="div"
              className="mt-1 text-[19px] text-[#1B1D22]/80"
            />
          </div>
        </motion.div>

        {/* 4 колонки-категории */}
        <div className="mt-6 grid flex-1 grid-cols-4 gap-4">
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
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-[#D5A52A]/15 text-[#8C6A1A]">
                  <br.Icon size={26} strokeWidth={1.8} />
                </div>
                <Editable
                  id={`s3.${br.id}.name`}
                  defaultValue={br.name}
                  as="div"
                  className="text-[21px] font-semibold leading-[1.15] text-[#1B1D22]"
                />
              </div>
              <ul className="mt-4 space-y-3">
                {br.leaves.map((leaf, j) => {
                  const LeafIcon = leaf.i;
                  return (
                    <li
                      key={j}
                      className="flex items-start gap-2.5 text-[17px] leading-[1.3] text-[#1B1D22]/85"
                    >
                      <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#F7F4EC] text-[#8C6A1A]">
                        <LeafIcon size={16} strokeWidth={1.8} />
                      </span>
                      <Editable id={`s3.${br.id}.leaf.${j}`} defaultValue={leaf.t} multiline />
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s3.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s3.foot.page" defaultValue="03 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
