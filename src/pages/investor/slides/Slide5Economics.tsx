import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Users, Megaphone, PiggyBank } from "lucide-react";

// Все стоимости — тыс. руб.
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

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ");

function CleanTable({
  rows,
  unit,
}: {
  rows: { name: string; value: number; id: string }[];
  unit: string;
}) {
  return (
    <table className="mt-3 w-full text-[17px]">
      <thead>
        <tr className="border-b border-[#D5A52A]/40">
          <th className="pb-2 text-left text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
            Наименование
          </th>
          <th className="pb-2 text-right text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A] whitespace-nowrap">
            {unit}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            className="border-b border-[#D5A52A]/15 odd:bg-[#F7F4EC]/40"
          >
            <td className="py-2 pl-1 pr-3 text-[#1B1D22]/85">
              <Editable id={`${r.id}.name`} defaultValue={r.name} />
            </td>
            <td className="py-2 pr-1 text-right font-semibold text-[#1B1D22] whitespace-nowrap tabular-nums">
              <Editable id={`${r.id}.v`} defaultValue={fmt(r.value)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Slide5Economics() {
  const teamRows = team.map((r, i) => ({ id: `s5.team.${i}`, name: r.role, value: r.monthly }));
  const promoRows = promo.map((r, i) => ({ id: `s5.promo.${i}`, name: r.name, value: r.v }));

  return (
    <SlideLayout kicker="Экономика · Затраты · 12 мес">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[65px]">
        <Editable
          id="s5.title"
          as="h2"
          defaultValue="Бюджет и структура затрат на год"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />

        <div className="mt-6 grid flex-1 grid-cols-3 gap-5">
          {/* Команда */}
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Users size={22} strokeWidth={1.8} className="text-[#8C6A1A]" />
              <Editable
                id="s5.team.title"
                defaultValue="Команда · ФОТ"
                as="div"
                className="text-[20px] font-semibold text-[#1B1D22]"
              />
            </div>
            <CleanTable rows={teamRows} unit="тыс. руб. / мес." />
            <div className="mt-4 space-y-1 border-t border-[#D5A52A]/30 pt-3 text-[17px]">
              <div className="flex justify-between text-[#1B1D22]/85">
                <span>За месяц</span>
                <span className="font-semibold tabular-nums">
                  <Editable id="s5.team.sum.m" defaultValue="1 650 тыс. руб." />
                </span>
              </div>
              <div className="flex justify-between text-[#8C6A1A] font-semibold">
                <span>За год</span>
                <span className="tabular-nums">
                  <Editable id="s5.team.sum.y" defaultValue="19 800 тыс. руб." />
                </span>
              </div>
            </div>
          </div>

          {/* Продвижение */}
          <div className="rounded-2xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Megaphone size={22} strokeWidth={1.8} className="text-[#8C6A1A]" />
              <Editable
                id="s5.promo.title"
                defaultValue="Продвижение · 12 мес"
                as="div"
                className="text-[20px] font-semibold text-[#1B1D22]"
              />
            </div>
            <CleanTable rows={promoRows} unit="тыс. руб. / год" />
            <div className="mt-4 border-t border-[#D5A52A]/30 pt-3 flex justify-between text-[17px] font-semibold text-[#8C6A1A]">
              <span>За год</span>
              <span className="tabular-nums">
                <Editable id="s5.promo.sum.y" defaultValue="4 000 тыс. руб." />
              </span>
            </div>
            <div className="mt-2 flex justify-between text-[15px] text-[#1B1D22]/65">
              <span>Инфраструктура и ИИ</span>
              <span className="tabular-nums">
                <Editable id="s5.infra.v" defaultValue="1 500 тыс. руб." />
              </span>
            </div>
          </div>

          {/* Итого */}
          <div className="rounded-2xl border border-[#D5A52A]/50 bg-[#D5A52A]/10 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <PiggyBank size={22} strokeWidth={1.8} className="text-[#8C6A1A]" />
              <Editable
                id="s5.total.title"
                defaultValue="ИТОГО · ГОД"
                as="div"
                className="text-[15px] font-semibold uppercase tracking-[0.18em] text-[#8C6A1A]"
              />
            </div>
            <Editable
              id="s5.total.value"
              defaultValue="25,3 млн руб."
              as="div"
              className="mt-2 text-[52px] font-bold leading-none text-[#1B1D22] tabular-nums"
            />
            <div className="mt-3 h-[180px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="v"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={78}
                    paddingAngle={4}
                    stroke="#F7F4EC"
                    strokeWidth={2}
                  >
                    {donut.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #D5A52A", fontSize: 15 }}
                    formatter={(value: number, name: string) => [`${fmt(value)} тыс. руб.`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {donut.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-[15px] text-[#1B1D22]/85">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                  <span className="tabular-nums font-medium">{fmt(d.v)}</span>
                </div>
              ))}
            </div>
            <Editable
              id="s5.total.round"
              defaultValue="Раунд-запрос: 5–10 млн руб."
              as="div"
              className="mt-3 text-[16px] font-semibold text-[#1B1D22]"
            />
          </div>
        </div>

        <Editable
          id="s5.foot"
          as="div"
          multiline
          defaultValue="Все цифры оценочные, подлежат уточнению. Все суммы в тыс./млн руб."
          className="mt-3 text-[15px] text-[#1B1D22]/60"
        />
        <div className="mt-1 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s5.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5.foot.page" defaultValue="05 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
