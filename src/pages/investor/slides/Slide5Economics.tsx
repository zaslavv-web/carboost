import SlideLayout from "../SlideLayout";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

// ==== Team (тыс. ₽ / мес, gross) ====
const team = [
  { role: "2 × Fullstack-разработчик", monthly: 500 },
  { role: "1 × CTO / Tech Lead",       monthly: 500 },
  { role: "1 × Sales Lead (+ бонус %)", monthly: 250 },
];

// ==== Promo & infra (тыс. ₽ / год) ====
const promo = [
  { name: "Контент, SEO, соцсети",     v: 1_200 },
  { name: "Performance / таргет",       v: 1_200 },
  { name: "HR-конференции (HR EXPO)",   v: 800 },
  { name: "PR и партнёрства",           v: 500 },
  { name: "Демо-стенд и материалы",     v: 300 },
];
const infraYear = 1_500;

const fmt = (v: number) => v.toLocaleString("ru-RU");
const teamMonthly = team.reduce((s, r) => s + r.monthly, 0);
const teamYear = teamMonthly * 12;
const promoYear = promo.reduce((s, r) => s + r.v, 0);
const total = teamYear + promoYear + infraYear;

// ==== Unit-economics ====
// 2 000 ₽ / сотрудник / мес × 200 сотр × 12 мес = 4 800 000 ₽ / клиент / год
const seatPrice = 2_000;               // ₽ / seat / мес
const avgSeats = 200;                  // сотр на клиента
const arpuYear = seatPrice * avgSeats * 12 / 1000; // тыс ₽ = 4800
const clientsY1 = 4;
const clientsY2 = 12;
const clientsY3 = 30;
const grossMargin = 0.72;
const cac = Math.round(promoYear / clientsY1); // тыс ₽ на клиента
const paybackMonths = Math.ceil(cac / (arpuYear * grossMargin / 12));
const ltv = Math.round(arpuYear * grossMargin * 3); // 3 года retention
const arrY1 = arpuYear * clientsY1;
const arrY2 = arpuYear * clientsY2;
const arrY3 = arpuYear * clientsY3;
const breakEvenClients = Math.ceil(total / (arpuYear * grossMargin));

const donut = [
  { name: "Команда (ФОТ)",       v: teamYear,  fill: "#D5A52A" },
  { name: "Продвижение",         v: promoYear, fill: "#8C6A1A" },
  { name: "Инфраструктура / AI", v: infraYear, fill: "#5A4410" },
];

const raiseLow = 5_000;   // тыс ₽
const raiseHigh = 10_000; // тыс ₽

export default function Slide5Economics() {
  return (
    <SlideLayout kicker="Экономика · Бюджет и окупаемость · 12 мес">
      <div className="grid h-full grid-cols-12 gap-5 px-14 pt-28 pb-10">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#F5F1E8]">
            Бюджет, <span className="italic text-[#D5A52A]">юнит-экономика</span> и окупаемость
          </h2>
        </div>

        {/* Team */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-semibold text-[#F5F1E8]">Команда · ФОТ</div>
            <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">gross / мес</div>
          </div>
          <table className="mt-2 w-full text-[14px]">
            <tbody>
              {team.map((r) => (
                <tr key={r.role} className="border-b border-[#D5A52A]/10 last:border-0">
                  <td className="py-1.5 text-[#F5F1E8]/85">{r.role}</td>
                  <td className="py-1.5 text-right font-mono text-[#F5F1E8]">{fmt(r.monthly)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 border-t border-[#D5A52A]/30 pt-2">
            <div className="flex items-baseline justify-between text-[14px] text-[#F5F1E8]/70">
              <span>Мес</span>
              <span className="font-mono text-[#F5F1E8]">{fmt(teamMonthly)} тыс. ₽</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] text-[#F5F1E8]/70">Год</span>
              <span className="font-['Instrument_Serif'] text-[26px] text-[#D5A52A]">
                {fmt(teamYear)} тыс. ₽
              </span>
            </div>
          </div>
        </div>

        {/* Promo */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-semibold text-[#F5F1E8]">Продвижение · 12 мес</div>
            <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">тыс. ₽</div>
          </div>
          <table className="mt-2 w-full text-[14px]">
            <tbody>
              {promo.map((r) => (
                <tr key={r.name} className="border-b border-[#D5A52A]/10 last:border-0">
                  <td className="py-1.5 text-[#F5F1E8]/85">{r.name}</td>
                  <td className="py-1.5 text-right font-mono text-[#F5F1E8]">{fmt(r.v)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-[#F5F1E8]/85">Инфра / AI-тарифы</td>
                <td className="py-1.5 text-right font-mono text-[#F5F1E8]">{fmt(infraYear)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-2">
            <span className="text-[14px] text-[#F5F1E8]/70">Итого маркетинг + инфра</span>
            <span className="font-['Instrument_Serif'] text-[26px] text-[#D5A52A]">
              {fmt(promoYear + infraYear)} тыс. ₽
            </span>
          </div>
        </div>

        {/* Donut & total */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/5 p-5">
          <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">Итого бюджет · год</div>
          <div className="mt-1 font-['Instrument_Serif'] text-[64px] leading-none text-[#F5F1E8]">
            ₽ {(total / 1000).toFixed(1)} млн
          </div>
          <div className="mt-1 text-[14px] text-[#F5F1E8]/65">
            {fmt(total)} тыс. ₽ · раунд-запрос {raiseLow / 1000}–{raiseHigh / 1000} млн ₽
          </div>
          <div className="mt-2 h-[130px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="v" nameKey="name" innerRadius={35} outerRadius={60} paddingAngle={3}>
                  {donut.map((d, i) => (<Cell key={i} fill={d.fill} />))}
                </Pie>
                <Tooltip contentStyle={{ background: "#1B1D22", border: "1px solid #D5A52A" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Unit economics */}
        <div className="col-span-8 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-semibold text-[#F5F1E8]">Юнит-экономика · клиент 200+ сотр.</div>
            <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">2 000 ₽ / seat / мес</div>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-3">
            {[
              { label: "ARPU / год",           value: `₽ ${(arpuYear / 1000).toFixed(1)} млн`, sub: "200 сотр × 2 000 ₽ × 12" },
              { label: "Gross margin",         value: `${Math.round(grossMargin * 100)}%`,     sub: "после инфры / AI / support" },
              { label: "CAC",                  value: `₽ ${fmt(cac)} тыс.`,                    sub: `бюджет ${fmt(promoYear)} / ${clientsY1} клиента` },
              { label: "Payback",              value: `${paybackMonths} мес`,                  sub: "маржинальный, per client" },
              { label: "LTV / CAC",            value: `${(ltv / cac).toFixed(1)}×`,            sub: `LTV ≈ ₽ ${fmt(ltv)} тыс. (3 года)` },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-[#D5A52A]/20 bg-[#1B1D22] p-3">
                <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">{m.label}</div>
                <div className="mt-1 font-['Instrument_Serif'] text-[26px] leading-none text-[#F5F1E8]">
                  {m.value}
                </div>
                <div className="mt-1 text-[11px] text-[#F5F1E8]/55">{m.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { y: "Y1 · 12 мес",  n: clientsY1, arr: arrY1 },
              { y: "Y2 · 24 мес",  n: clientsY2, arr: arrY2 },
              { y: "Y3 · 36 мес",  n: clientsY3, arr: arrY3 },
            ].map((r) => (
              <div key={r.y} className="rounded-xl border border-[#D5A52A]/25 bg-[#1B1D22] p-3">
                <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">{r.y}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-['Instrument_Serif'] text-[28px] text-[#F5F1E8]">{r.n}</span>
                  <span className="text-[13px] text-[#F5F1E8]/60">клиентов</span>
                </div>
                <div className="mt-1 text-[15px] text-[#F5F1E8]/80">
                  ARR ≈ <span className="text-[#D5A52A]">₽ {(r.arr / 1000).toFixed(1)} млн</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Break-even */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/5 p-5">
          <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">Точка безубыточности</div>
          <div className="mt-1 font-['Instrument_Serif'] text-[54px] leading-none text-[#F5F1E8]">
            {breakEvenClients} клиентов
          </div>
          <div className="mt-2 text-[14px] leading-[1.4] text-[#F5F1E8]/75">
            При марже {Math.round(grossMargin * 100)}% и ARPU ₽ {(arpuYear / 1000).toFixed(1)} млн операционная безубыточность
            достигается в течение <b className="text-[#D5A52A]">Q2–Q3 второго года</b>.
          </div>
          <div className="mt-3 border-t border-[#D5A52A]/25 pt-2 text-[13px] text-[#F5F1E8]/60">
            Плановый ARR к концу Y3 — <span className="text-[#D5A52A]">₽ {(arrY3 / 1000).toFixed(0)} млн</span>,
            EBITDA-положительный с Y2.
          </div>
        </div>

        <div className="col-span-12 text-[12px] text-[#F5F1E8]/50">
          Все цифры — оценочные, подлежат уточнению в due diligence. Валюта — рубли (тыс. / млн).
        </div>
      </div>
    </SlideLayout>
  );
}
