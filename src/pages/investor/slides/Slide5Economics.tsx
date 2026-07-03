import SlideLayout from "../SlideLayout";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const team = [
  { role: "2 × Fullstack-разработчик", monthly: 500 },
  { role: "1 × Backend / DevOps", monthly: 200 },
  { role: "1 × Продакт-менеджер", monthly: 350 },
  { role: "1 × Продуктовый дизайнер", monthly: 250 },
  { role: "1 × Sales lead (+ бонус)", monthly: 300 },
  { role: "1 × CS / имплементация", monthly: 200 },
  { role: "1 × Маркетолог", monthly: 200 },
];

const promo = [
  { name: "Контент / SEO", v: 3_600 },
  { name: "Performance / таргет", v: 3_600 },
  { name: "HR-конференции (HR EXPO, HR Digital)", v: 1_000 },
  { name: "PR и партнёрства", v: 1_500 },
  { name: "Демо-стенд и материалы", v: 500 },
];

const fmt = (v: number) => v.toLocaleString("ru-RU");
const teamMonthly = team.reduce((s, r) => s + r.monthly, 0);
const teamYear = teamMonthly * 12;
const promoYear = promo.reduce((s, r) => s + r.v, 0);
const infraYear = 3_000;
const total = teamYear + promoYear + infraYear;

const donut = [
  { name: "Команда (ФОТ)", v: teamYear, fill: "#D5A52A" },
  { name: "Продвижение", v: promoYear, fill: "#8C6A1A" },
  { name: "Инфраструктура / AI", v: infraYear, fill: "#5A4410" },
];

export default function Slide5Economics() {
  return (
    <SlideLayout kicker="Экономика продукта · 12 месяцев">
      <div className="grid h-full grid-cols-12 gap-6 px-16 pt-28 pb-14">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[64px] leading-none text-[#F5F1E8]">
            Бюджет <span className="italic text-[#D5A52A]">на год</span>
          </h2>
          <p className="mt-2 text-[18px] text-[#F5F1E8]/65">
            Оценка для HR-tech B2B на российском рынке. Все суммы — в тыс. ₽ (gross).
          </p>
        </div>

        {/* Team */}
        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-baseline justify-between">
            <div className="text-[24px] font-semibold text-[#F5F1E8]">Команда</div>
            <div className="text-[14px] uppercase tracking-widest text-[#D5A52A]">ФОТ</div>
          </div>
          <table className="mt-3 w-full text-[16px]">
            <tbody>
              {team.map((r) => (
                <tr key={r.role} className="border-b border-[#D5A52A]/10 last:border-0">
                  <td className="py-2 text-[#F5F1E8]/85">{r.role}</td>
                  <td className="py-2 text-right font-mono text-[#F5F1E8]">{fmt(r.monthly)} / мес</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-3">
            <span className="text-[16px] text-[#F5F1E8]/70">Итого ФОТ, мес → год</span>
            <span className="font-['Instrument_Serif'] text-[32px] text-[#D5A52A]">
              {fmt(teamMonthly)} → {fmt(teamYear)} тыс. ₽
            </span>
          </div>
        </div>

        {/* Promo */}
        <div className="col-span-6 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-6">
          <div className="flex items-baseline justify-between">
            <div className="text-[24px] font-semibold text-[#F5F1E8]">Продвижение</div>
            <div className="text-[14px] uppercase tracking-widest text-[#D5A52A]">12 мес</div>
          </div>
          <table className="mt-3 w-full text-[16px]">
            <tbody>
              {promo.map((r) => (
                <tr key={r.name} className="border-b border-[#D5A52A]/10 last:border-0">
                  <td className="py-2 text-[#F5F1E8]/85">{r.name}</td>
                  <td className="py-2 text-right font-mono text-[#F5F1E8]">{fmt(r.v)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 text-[#F5F1E8]/85">Инфраструктура / AI-тарифы</td>
                <td className="py-2 text-right font-mono text-[#F5F1E8]">{fmt(infraYear)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-3">
            <span className="text-[16px] text-[#F5F1E8]/70">Итого маркетинг + инфра</span>
            <span className="font-['Instrument_Serif'] text-[32px] text-[#D5A52A]">
              {fmt(promoYear + infraYear)} тыс. ₽
            </span>
          </div>
        </div>

        {/* Totals + donut */}
        <div className="col-span-8 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/5 p-6">
          <div className="text-[14px] uppercase tracking-widest text-[#D5A52A]">Итого раунд-запрос · 12 месяцев</div>
          <div className="mt-2 font-['Instrument_Serif'] text-[110px] leading-none text-[#F5F1E8]">
            ₽ {fmt(total)} тыс.
          </div>
          <div className="mt-2 text-[18px] text-[#F5F1E8]/70">
            ≈ ₽ {(total / 1000).toFixed(1)} млн — команда, продвижение и инфраструктура на первый год.
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-[15px]">
            <div className="rounded-lg bg-[#1B1D22] p-3">
              <div className="text-[#D5A52A]">Команда</div>
              <div className="font-mono text-[#F5F1E8]">{fmt(teamYear)} тыс. ₽ · {Math.round((teamYear / total) * 100)}%</div>
            </div>
            <div className="rounded-lg bg-[#1B1D22] p-3">
              <div className="text-[#D5A52A]">Продвижение</div>
              <div className="font-mono text-[#F5F1E8]">{fmt(promoYear)} тыс. ₽ · {Math.round((promoYear / total) * 100)}%</div>
            </div>
            <div className="rounded-lg bg-[#1B1D22] p-3">
              <div className="text-[#D5A52A]">Инфра / AI</div>
              <div className="font-mono text-[#F5F1E8]">{fmt(infraYear)} тыс. ₽ · {Math.round((infraYear / total) * 100)}%</div>
            </div>
          </div>
        </div>

        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-4">
          <div className="text-[14px] uppercase tracking-widest text-[#D5A52A]">Структура затрат</div>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="v" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {donut.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#1B1D22", border: "1px solid #D5A52A" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-[13px] text-[#F5F1E8]/60">
            Все цифры — оценочные, подлежат уточнению.
          </div>
        </div>
      </div>
    </SlideLayout>
  );
}
