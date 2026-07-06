import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const companiesGrowth = [
  { y: "2021", v: 17.8 },
  { y: "2022", v: 18.6 },
  { y: "2023", v: 19.4 },
  { y: "2024", v: 20.5 },
  { y: "2025п", v: 21.7 },
];

const hrtechMarket = [
  { y: "2021", v: 24 },
  { y: "2022", v: 33 },
  { y: "2023", v: 47 },
  { y: "2024", v: 68 },
  { y: "2025п", v: 92 },
];

const pains = [
  "Отток ключевых сотрудников и рост стоимости замены (до 1,5 годовых окладов)",
  "Разрозненные системы: LMS, ATS, опросы, KPI, 1:1 — данные не бьются",
  "Долгая и неструктурированная адаптация — потеря продуктивности первые 3–6 мес",
  "Отсутствие прозрачных карьерных треков и объективной оценки компетенций",
  "Нехватка HR-аналитики для доски директоров: риски, вовлечённость, ROI обучения",
];

function BigNumber({ id, value, unit }: { id: string; value: string; unit: string }) {
  return (
    <div className="mt-4 flex items-baseline gap-4">
      <Editable id={`${id}.v`} defaultValue={value}
        className="font-['Instrument_Serif'] text-[60px] leading-none text-[#F5F1E8]" />
      <Editable id={`${id}.u`} defaultValue={unit}
        className="text-[24px] font-light text-[#F5F1E8]/70" />
    </div>
  );
}

export default function Slide2Market() {
  return (
    <SlideLayout kicker="Рынок · Россия · 2024–2025">
      <div className="grid h-full grid-cols-12 gap-8 px-16 pt-28 pb-14">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[60px] leading-[1.05] text-[#F5F1E8]">
          <Editable id="s2.title.a" defaultValue="Основные показатели " />
          <span className="italic text-[#D5A52A]"><Editable id="s2.title.b" defaultValue="рынка HRTech" /></span>
          <Editable id="s2.title.c" defaultValue=" в России" />
        </h2>

        {/* Stat cards */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] px-8 py-6">
          <Editable id="s2.k1" defaultValue="Целевые компании" as="div"
            className="text-[15px] uppercase tracking-widest text-[#D5A52A]" />
          <BigNumber id="s2.n1" value="21" unit="тыс. компаний" />
          <Editable id="s2.t1" as="div" multiline
            defaultValue="Юр.лиц в РФ со штатом 250+ (Росстат, реестр МСП, 2024). Темпы роста ~4% в год."
            className="mt-3 text-[16px] text-[#F5F1E8]/70" />
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] px-8 py-6">
          <Editable id="s2.k2" defaultValue="Расходы на 1 сотрудника" as="div"
            className="text-[15px] uppercase tracking-widest text-[#D5A52A]" />
          <BigNumber id="s2.n2" value="₽ 140–180" unit="тыс. / год" />
          <Editable id="s2.t2" as="div" multiline
            defaultValue="Онбординг + обучение + удержание (HH Talent Report 2024, Kept HR Survey 2024). +18% г/г."
            className="mt-3 text-[16px] text-[#F5F1E8]/70" />
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] px-8 py-6">
          <Editable id="s2.k3" defaultValue="Рынок HR-tech РФ" as="div"
            className="text-[15px] uppercase tracking-widest text-[#D5A52A]" />
          <BigNumber id="s2.n3" value="₽ 92" unit="млрд · прогноз 2025" />
          <Editable id="s2.t3" as="div" multiline
            defaultValue="TAdviser, Smart Ranking. Темпы роста ~35% в год (2021–2025)."
            className="mt-3 text-[16px] text-[#F5F1E8]/70" />
        </div>

        {/* Charts */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/20 bg-[#25272D] p-5">
          <div className="text-[16px] text-[#F5F1E8]/70">Компании 250+ сотрудников, тыс.</div>
          <div className="mt-2 h-[220px]">
            <ResponsiveContainer>
              <LineChart data={companiesGrowth}>
                <CartesianGrid stroke="#2F3138" vertical={false} />
                <XAxis dataKey="y" stroke="#F5F1E880" fontSize={13} />
                <YAxis stroke="#F5F1E880" fontSize={13} />
                <Tooltip contentStyle={{ background: "#1B1D22", border: "1px solid #D5A52A" }} />
                <Line type="monotone" dataKey="v" stroke="#D5A52A" strokeWidth={3} dot={{ r: 4, fill: "#D5A52A" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[12px] text-[#F5F1E8]/50">Источник: Росстат, ФНС</div>
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/20 bg-[#25272D] p-5">
          <div className="text-[16px] text-[#F5F1E8]/70">Объём HR-tech в РФ, ₽ млрд</div>
          <div className="mt-2 h-[220px]">
            <ResponsiveContainer>
              <BarChart data={hrtechMarket}>
                <CartesianGrid stroke="#2F3138" vertical={false} />
                <XAxis dataKey="y" stroke="#F5F1E880" fontSize={13} />
                <YAxis stroke="#F5F1E880" fontSize={13} />
                <Tooltip contentStyle={{ background: "#1B1D22", border: "1px solid #D5A52A" }} />
                <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                  {hrtechMarket.map((_, i) => (
                    <Cell key={i} fill={i === hrtechMarket.length - 1 ? "#D5A52A" : "#D5A52A99"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[12px] text-[#F5F1E8]/50">Источник: TAdviser, Smart Ranking</div>
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/20 bg-[#25272D] p-5">
          <div className="text-[16px] font-semibold text-[#F5F1E8]">Ежедневные боли HRD</div>
          <ul className="mt-3 space-y-2">
            {pains.map((p, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-[1.35] text-[#F5F1E8]/80">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-12 mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-[#F5F1E8]/55">
          <span className="text-[#D5A52A]">Источники:</span>
          <a href="https://rosstat.gov.ru/" target="_blank" rel="noreferrer" className="underline hover:text-[#D5A52A]">Росстат</a>
          <a href="https://www.tadviser.ru/index.php/Статья:HRTech" target="_blank" rel="noreferrer" className="underline hover:text-[#D5A52A]">TAdviser HRTech</a>
          <a href="https://smart-ranking.ru/" target="_blank" rel="noreferrer" className="underline hover:text-[#D5A52A]">Smart Ranking</a>
          <a href="https://hh.ru/article/analytics" target="_blank" rel="noreferrer" className="underline hover:text-[#D5A52A]">HeadHunter Talent Report 2024</a>
          <a href="https://kept.ru/" target="_blank" rel="noreferrer" className="underline hover:text-[#D5A52A]">Kept HR Survey 2024</a>
          <span className="opacity-60">· Цифры являются оценочными и подлежат уточнению.</span>
        </div>
      </div>
    </SlideLayout>
  );
}
