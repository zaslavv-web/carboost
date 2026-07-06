import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Users, Megaphone, PiggyBank } from "lucide-react";

const team = [
  { role: "2 × Разработчик (fullstack)", monthly: 500 },
  { role: "1 × Технический лидер", monthly: 500 },
  { role: "1 × Руководитель продаж (+ бонус %)", monthly: 250 },
  { role: "1 × Владелец продукта", monthly: 400 },
];

const promo = [
  { name: "Контент, поисковый трафик, соцсети", v: 1200 },
  { name: "Реклама и таргетинг", v: 1200 },
  { name: "Отраслевые конференции", v: 800 },
  { name: "Пиар и партнёрства", v: 500 },
  { name: "Демо-стенд и материалы", v: 300 },
];

const donut = [
  { name: "Команда (ФОТ)", v: 19800, fill: "#D5A52A" },
  { name: "Продвижение", v: 4000, fill: "#8C6A1A" },
  { name: "Инфраструктура и ИИ", v: 1500, fill: "#5A4410" },
];

export default function Slide5Economics() {
  return (
    <SlideLayout kicker="Экономика · Затраты · 12 мес">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s5.title"
          as="h2"
          defaultValue="Бюджет и структура затрат на год"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />

        <div className="mt-8 grid flex-1 grid-cols-3 gap-6">
          {/* Команда */}
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-3">
                <Users size={26} strokeWidth={1.8} className="text-[#8C6A1A]" />
                <Editable
                  id="s5.team.title"
                  defaultValue="Команда · фонд оплаты труда"
                  as="div"
                  className="text-[26px] font-semibold text-[#1B1D22]"
                />
              </div>
              <Editable
                id="s5.team.unit"
                defaultValue="Тыс. р./мес."
                as="div"
                className="text-[22px] uppercase tracking-widest text-[#8C6A1A]"
              />
            </div>
            <table className="mt-4 w-full text-[24px]">
              <tbody>
                {team.map((r, i) => (
                  <tr key={i} className="border-b border-[#D5A52A]/20 last:border-0">
                    <td className="py-2 text-[#1B1D22]/85">
                      <Editable id={`s5.team.${i}.role`} defaultValue={r.role} />
                    </td>
                    <td className="py-2 text-right font-mono text-[#1B1D22]">
                      <Editable id={`s5.team.${i}.v`} defaultValue={String(r.monthly)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-5 border-t border-[#D5A52A]/30 pt-3 text-[24px] text-[#1B1D22]/80">
              <div className="flex justify-between">
                <span>Мес:</span>
                <Editable id="s5.team.sum.m" defaultValue="1 650 тыс. ₽" />
              </div>
              <div className="mt-1 flex justify-between font-semibold text-[#8C6A1A]">
                <span>Год:</span>
                <Editable id="s5.team.sum.y" defaultValue="19 800 тыс. ₽" />
              </div>
            </div>
          </div>

          {/* Продвижение */}
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <Editable
                id="s5.promo.title"
                defaultValue="Продвижение · 12 мес"
                as="div"
                className="text-[26px] font-semibold text-[#1B1D22]"
              />
              <Editable
                id="s5.promo.unit"
                defaultValue="Тыс. р./год"
                as="div"
                className="text-[22px] uppercase tracking-widest text-[#8C6A1A]"
              />
            </div>
            <table className="mt-4 w-full text-[24px]">
              <tbody>
                {promo.map((r, i) => (
                  <tr key={i} className="border-b border-[#D5A52A]/20 last:border-0">
                    <td className="py-2 text-[#1B1D22]/85">
                      <Editable id={`s5.promo.${i}.name`} defaultValue={r.name} />
                    </td>
                    <td className="py-2 text-right font-mono text-[#1B1D22]">
                      <Editable id={`s5.promo.${i}.v`} defaultValue={String(r.v).replace(/(\d)(?=(\d{3})+$)/g, "$1 ")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-5 border-t border-[#D5A52A]/30 pt-3 flex justify-between text-[24px] font-semibold text-[#8C6A1A]">
              <span>Год:</span>
              <Editable id="s5.promo.sum.y" defaultValue="5 500 тыс. ₽" />
            </div>
          </div>

          {/* Итого */}
          <div className="rounded-2xl border border-[#D5A52A]/50 bg-[#D5A52A]/10 p-6 shadow-sm">
            <Editable
              id="s5.total.title"
              defaultValue="ИТОГО БЮДЖЕТ · ГОД"
              as="div"
              className="text-[24px] uppercase tracking-widest text-[#8C6A1A]"
            />
            <Editable
              id="s5.total.value"
              defaultValue="₽ 25,3 млн"
              as="div"
              className="mt-3 font-['Instrument_Serif'] text-[72px] leading-none text-[#1B1D22]"
            />
            <div className="mt-2 flex items-baseline justify-between text-[24px] text-[#1B1D22]/85">
              <Editable id="s5.infra.name" defaultValue="Инфраструктура и ИИ" />
              <Editable id="s5.infra.v" defaultValue="1 500" />
            </div>
            <div className="mt-4 h-[220px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="v"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    stroke="#F7F4EC"
                    strokeWidth={2}
                  >
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #D5A52A", fontSize: 20 }}
                    formatter={(value: number, name: string) => [`${value.toLocaleString("ru-RU")} тыс. ₽`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {donut.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-[22px] text-[#1B1D22]/85">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                  <span className="font-mono">{d.v.toLocaleString("ru-RU")}</span>
                </div>
              ))}
            </div>
            <Editable
              id="s5.total.round"
              defaultValue="25 300 тыс. ₽ · раунд-запрос 5–10 млн ₽"
              as="div"
              className="mt-3 text-[22px] font-semibold text-[#1B1D22]"
            />
          </div>
        </div>

        <Editable
          id="s5.foot"
          as="div"
          multiline
          defaultValue="Все цифры оценочные, подлежат уточнению. Валюта — рубли (тыс. / млн)."
          className="mt-4 text-[22px] text-[#1B1D22]/60"
        />
        <div className="mt-2 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s5.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5.foot.page" defaultValue="05 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
