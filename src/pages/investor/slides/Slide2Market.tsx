import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import painsImg from "@/assets/deck/slide2-pains.png";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { Building2, Wallet, TrendingUp } from "lucide-react";

const hrtechMarket = [
  { y: "2021", v: 24 },
  { y: "2022", v: 33 },
  { y: "2023", v: 47 },
  { y: "2024", v: 68 },
  { y: "2025", v: 92 },
];

const kpis = [
  {
    id: "s2.k1",
    Icon: Building2,
    label: "КОМПАНИЙ · ШТАТ 100+",
    value: "1,3 млн",
    note: "Юр. лиц в РФ (Росстат, 2024). +4% г/г.",
  },
  {
    id: "s2.k2",
    Icon: Wallet,
    label: "HR-РАСХОДЫ / СОТРУДНИК",
    value: "140–180 тыс. руб.",
    note: "Адаптация, обучение, удержание (HH, Kept 2024).",
  },
  {
    id: "s2.k3",
    Icon: TrendingUp,
    label: "РЫНОК HR-TECH РФ · 2025",
    value: "92 млрд руб.",
    note: "TAdviser, Smart Ranking. Рост ~35% г/г.",
  },
];

const pains = [
  { id: "s2.pain.0", text: "Отток ключевых сотрудников: замена до 1,5 годовых окладов" },
  { id: "s2.pain.1", text: "Разрозненные системы — данные не сходятся" },
  { id: "s2.pain.2", text: "Долгая адаптация: −3–6 мес продуктивности" },
  { id: "s2.pain.3", text: "Нет прозрачных карьерных треков и объективной оценки" },
  { id: "s2.pain.4", text: "Нехватка кадровой аналитики для совета директоров" },
];

export default function Slide2Market() {
  return (
    <SlideLayout kicker="Рынок · Россия · 2024–2025">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[70px]">
        <Editable
          id="s2.title"
          as="h2"
          defaultValue="Основные показатели рынка кадровых технологий в России"
          className="text-[48px] font-bold leading-[1.05] text-[#1B1D22]"
        />

        {/* KPI ряд — облегчённые */}
        <div className="mt-6 grid grid-cols-3 gap-5">
          {kpis.map((k, i) => (
            <motion.div
              key={k.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
              className="rounded-2xl border border-[#D5A52A]/40 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[#8C6A1A]">
                  <k.Icon size={22} strokeWidth={1.8} />
                  <Editable
                    id={`${k.id}.label`}
                    defaultValue={k.label}
                    as="div"
                    className="text-[15px] font-semibold uppercase tracking-[0.18em] leading-[1.2]"
                  />
                </div>
              </div>
              <Editable
                id={`${k.id}.value`}
                defaultValue={k.value}
                as="div"
                className="mt-3 text-[44px] font-bold leading-none text-[#1B1D22]"
              />
              <Editable
                id={`${k.id}.note`}
                defaultValue={k.note}
                as="div"
                multiline
                className="mt-3 text-[17px] leading-[1.35] text-[#1B1D22]/70"
              />
            </motion.div>
          ))}
        </div>

        {/* График + боли */}
        <div className="mt-5 grid flex-1 grid-cols-2 gap-5">
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm">
            <Editable
              id="s2.chart.title"
              defaultValue="Объём рынка кадровых технологий в РФ, млрд руб."
              as="div"
              className="text-[20px] font-semibold text-[#1B1D22]"
            />
            <div className="mt-3 h-[300px]">
              <ResponsiveContainer>
                <BarChart data={hrtechMarket}>
                  <CartesianGrid stroke="#D5A52A33" vertical={false} />
                  <XAxis dataKey="y" stroke="#1B1D2299" fontSize={16} />
                  <YAxis stroke="#1B1D2299" fontSize={16} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #D5A52A", color: "#1B1D22", fontSize: 16 }} />
                  <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                    {hrtechMarket.map((_, i) => (
                      <Cell key={i} fill={i === hrtechMarket.length - 1 ? "#D5A52A" : "#8C6A1A"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Editable
              id="s2.chart.src"
              defaultValue="Источник: TAdviser, Smart Ranking"
              as="div"
              className="mt-1 text-[15px] text-[#1B1D22]/55"
            />
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm">
            <img
              src={painsImg}
              alt=""
              aria-hidden
              loading="lazy"
              className="pointer-events-none absolute bottom-2 right-2 h-[220px] w-auto opacity-30"
            />
            <Editable
              id="s2.pains.title"
              defaultValue="Ежедневные боли директора по персоналу"
              as="div"
              className="text-[20px] font-semibold text-[#1B1D22]"
            />
            <ul className="relative mt-3 space-y-2.5">
              {pains.map((p) => (
                <li key={p.id} className="flex gap-3 text-[19px] leading-[1.3] text-[#1B1D22]/85">
                  <span className="mt-2.5 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                  <Editable id={p.id} defaultValue={p.text} multiline />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s2.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s2.foot.page" defaultValue="02 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
