import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
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
    label: "КОМПАНИЙ СО ШТАТОМ БОЛЬШЕ 100 ЧЕЛОВЕК",
    value: "1,3 МЛН.",
    note: "Юр. лиц в РФ, штат 100+ (Росстат, 2024). +4% г/г.",
  },
  {
    id: "s2.k2",
    Icon: Wallet,
    label: "HR РАСХОДЫ НА 1 СОТРУДНИКА",
    value: "₽ 140–180 ТЫС. РУБ.",
    note: "Адаптация + обучение + удержание (HH, Kept, 2024). +18% г/г.",
  },
  {
    id: "s2.k3",
    Icon: TrendingUp,
    label: "РЫНОК КАДРОВЫХ ТЕХНОЛОГИЙ РФ В 2025 ГОДУ",
    value: "₽ 92 млрд",
    note: "TAdviser, Smart Ranking. Рост ~35% в год.",
  },
];

const pains = [
  { id: "s2.pain.0", text: "Отток ключевых сотрудников: замена — до 1,5 годовых окладов" },
  { id: "s2.pain.1", text: "Разрозненные системы — данные не сходятся" },
  { id: "s2.pain.2", text: "Долгая адаптация — потеря 3–6 мес продуктивности" },
  { id: "s2.pain.3", text: "Нет прозрачных карьерных треков и объективной оценки" },
  { id: "s2.pain.4", text: "Нехватка кадровой аналитики для совета директоров" },
];

export default function Slide2Market() {
  return (
    <SlideLayout kicker="Рынок · Россия · 2024–2025">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s2.title"
          as="h2"
          defaultValue="Основные показатели рынка кадровых технологий в России"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />

        {/* KPI ряд */}
        <div className="mt-8 grid grid-cols-3 gap-6">
          {kpis.map((k, i) => (
            <motion.div
              key={k.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
              className="rounded-2xl border border-[#D5A52A]/40 bg-white p-7 shadow-sm"
            >
              <Editable
                id={`${k.id}.label`}
                defaultValue={k.label}
                as="div"
                className="text-[22px] uppercase tracking-widest text-[#8C6A1A] leading-[1.2]"
              />
              <Editable
                id={`${k.id}.value`}
                defaultValue={k.value}
                as="div"
                className="mt-4 font-['Instrument_Serif'] text-[64px] leading-none text-[#1B1D22]"
              />
              <Editable
                id={`${k.id}.note`}
                defaultValue={k.note}
                as="div"
                multiline
                className="mt-4 text-[24px] leading-[1.35] text-[#1B1D22]/70"
              />
            </motion.div>
          ))}
        </div>

        {/* График + боли */}
        <div className="mt-6 grid flex-1 grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
            <Editable
              id="s2.chart.title"
              defaultValue="Объём рынка кадровых технологий в РФ, ₽ млрд"
              as="div"
              className="text-[24px] font-semibold text-[#1B1D22]"
            />
            <div className="mt-4 h-[320px]">
              <ResponsiveContainer>
                <BarChart data={hrtechMarket}>
                  <CartesianGrid stroke="#D5A52A33" vertical={false} />
                  <XAxis dataKey="y" stroke="#1B1D2299" fontSize={20} />
                  <YAxis stroke="#1B1D2299" fontSize={20} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #D5A52A", color: "#1B1D22", fontSize: 20 }} />
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
              className="mt-2 text-[20px] text-[#1B1D22]/55"
            />
          </div>

          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
            <Editable
              id="s2.pains.title"
              defaultValue="Ежедневные боли директора по персоналу"
              as="div"
              className="text-[24px] font-semibold text-[#1B1D22]"
            />
            <ul className="mt-4 space-y-3">
              {pains.map((p) => (
                <li key={p.id} className="flex gap-3 text-[24px] leading-[1.3] text-[#1B1D22]/80">
                  <span className="mt-3 h-2.5 w-2.5 flex-none rounded-full bg-[#D5A52A]" />
                  <Editable id={p.id} defaultValue={p.text} multiline />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s2.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s2.foot.page" defaultValue="02 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
