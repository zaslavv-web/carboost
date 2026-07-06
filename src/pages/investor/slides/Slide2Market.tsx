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

const hrtechMarket = [
  { y: "2021", v: 24 },
  { y: "2022", v: 33 },
  { y: "2023", v: 47 },
  { y: "2024", v: 68 },
  { y: "2025п", v: 92 },
];

const painDefaults = [
  { id: "s2.pain.0", text: "Отток ключевых сотрудников и рост стоимости замены (до 1,5 годовых окладов)" },
  { id: "s2.pain.1", text: "Разрозненные системы: обучение, найм, опросы, показатели, встречи 1:1 — данные не сходятся" },
  { id: "s2.pain.2", text: "Долгая и неструктурированная адаптация — потеря продуктивности первые 3–6 мес" },
  { id: "s2.pain.3", text: "Отсутствие прозрачных карьерных треков и объективной оценки компетенций" },
  { id: "s2.pain.4", text: "Нехватка кадровой аналитики для совета директоров: риски, вовлечённость, отдача от обучения" },
];

const sourceDefaults = [
  { id: "s2.src.0", text: "Росстат", url: "https://rosstat.gov.ru/" },
  { id: "s2.src.1", text: "TAdviser HR-tech", url: "https://www.tadviser.ru/index.php/Статья:HRTech" },
  { id: "s2.src.2", text: "Smart Ranking", url: "https://smart-ranking.ru/" },
  { id: "s2.src.3", text: "HeadHunter Talent Report 2024", url: "https://hh.ru/article/analytics" },
  { id: "s2.src.4", text: "Kept HR Survey 2024", url: "https://kept.ru/" },
];

function BigNumber({ id, value, unit }: { id: string; value: string; unit: string }) {
  return (
    <div className="mt-6 flex items-baseline gap-4">
      <Editable id={`${id}.v`} defaultValue={value}
        className="font-['Instrument_Serif'] text-[60px] leading-none text-[#1B1D22]" />
      <Editable id={`${id}.u`} defaultValue={unit}
        className="text-[32px] font-light text-[#1B1D22]/70" />
    </div>
  );
}

export default function Slide2Market() {
  return (
    <SlideLayout kicker="Рынок · Россия · 2024–2025">
      <div className="grid h-full grid-cols-12 gap-8 px-16 pt-28 pb-14">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[60px] leading-[1.05] text-[#1B1D22]">
            <Editable id="s2.title.a" defaultValue="Основные показатели " />
            <span className="italic text-[#8C6A1A]"><Editable id="s2.title.b" defaultValue="рынка кадровых технологий" /></span>
            <Editable id="s2.title.c" defaultValue=" в России" />
          </h2>
        </div>

        {/* Stat cards — увеличены на ~40% */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-white px-11 py-9 shadow-sm">
          <Editable id="s2.k1" defaultValue="Целевые компании" as="div"
            className="text-[18px] uppercase tracking-widest text-[#8C6A1A]" />
          <BigNumber id="s2.n1" value="21" unit="тыс. компаний" />
          <Editable id="s2.t1" as="div" multiline
            defaultValue="Юр. лиц в РФ со штатом 100+ (Росстат, реестр МСП, 2024). Темпы роста ~4% в год."
            className="mt-4 text-[20px] leading-[1.35] text-[#1B1D22]/70" />
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-white px-11 py-9 shadow-sm">
          <Editable id="s2.k2" defaultValue="Расходы на 1 сотрудника" as="div"
            className="text-[18px] uppercase tracking-widest text-[#8C6A1A]" />
          <BigNumber id="s2.n2" value="₽ 140–180" unit="тыс. / год" />
          <Editable id="s2.t2" as="div" multiline
            defaultValue="Адаптация + обучение + удержание (HH Talent Report 2024, Kept HR Survey 2024). +18% г/г."
            className="mt-4 text-[20px] leading-[1.35] text-[#1B1D22]/70" />
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-white px-11 py-9 shadow-sm">
          <Editable id="s2.k3" defaultValue="Рынок кадровых технологий РФ" as="div"
            className="text-[18px] uppercase tracking-widest text-[#8C6A1A]" />
          <BigNumber id="s2.n3" value="₽ 92" unit="млрд · прогноз 2025" />
          <Editable id="s2.t3" as="div" multiline
            defaultValue="TAdviser, Smart Ranking. Темпы роста ~35% в год (2021–2025)."
            className="mt-4 text-[20px] leading-[1.35] text-[#1B1D22]/70" />
        </div>

        {/* Charts — теперь два блока по половине */}
        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <Editable id="s2.chart.title" defaultValue="Объём рынка кадровых технологий в РФ, ₽ млрд" as="div"
            className="text-[18px] text-[#1B1D22]/75" />
          <div className="mt-3 h-[300px]">
            <ResponsiveContainer>
              <BarChart data={hrtechMarket}>
                <CartesianGrid stroke="#D5A52A33" vertical={false} />
                <XAxis dataKey="y" stroke="#1B1D2299" fontSize={14} />
                <YAxis stroke="#1B1D2299" fontSize={14} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #D5A52A", color: "#1B1D22" }} />
                <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                  {hrtechMarket.map((_, i) => (
                    <Cell key={i} fill={i === hrtechMarket.length - 1 ? "#D5A52A" : "#8C6A1A"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Editable id="s2.chart.src" defaultValue="Источник: TAdviser, Smart Ranking" as="div"
            className="mt-1 text-[12px] text-[#1B1D22]/55" />
        </div>

        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
          <Editable id="s2.pains.title" defaultValue="Ежедневные боли директора по персоналу" as="div"
            className="text-[18px] font-semibold text-[#1B1D22]" />
          <ul className="mt-3 space-y-3">
            {painDefaults.map((p) => (
              <li key={p.id} className="flex gap-3 text-[17px] leading-[1.4] text-[#1B1D22]/80">
                <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                <Editable id={p.id} defaultValue={p.text} multiline />
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-12 mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-[#1B1D22]/60">
          <span className="text-[#8C6A1A] font-semibold">Источники:</span>
          {sourceDefaults.map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <Editable id={`${s.id}.text`} defaultValue={s.text} className="underline decoration-[#D5A52A]/50" />
              <span className="opacity-50">·</span>
              <Editable id={`${s.id}.url`} defaultValue={s.url} className="text-[11px] opacity-60" />
            </span>
          ))}
          <span className="opacity-60">· Цифры оценочные и подлежат уточнению.</span>
        </div>
      </div>
    </SlideLayout>
  );
}
