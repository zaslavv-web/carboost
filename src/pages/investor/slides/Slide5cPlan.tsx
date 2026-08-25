import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Users, Wallet, Flag } from "lucide-react";

// Данные из финансовой модели «Пик роста · бюджет». Все суммы — тыс. руб.
const plan = [
  { m: "окт 26", costs: 550, revenue: 0, profit: -550, clients: 0 },
  { m: "ноя 26", costs: 800, revenue: 0, profit: -800, clients: 0 },
  { m: "дек 26", costs: 1200, revenue: 425, profit: -775, clients: 0 },
  { m: "янв 27", costs: 1200, revenue: 225, profit: -975, clients: 1 },
  { m: "фев 27", costs: 2100, revenue: 1075, profit: -1025, clients: 3 },
  { m: "мар 27", costs: 2100, revenue: 1525, profit: -575, clients: 5 },
  { m: "апр 27", costs: 2100, revenue: 2400, profit: 300, clients: 8 },
  { m: "май 27", costs: 2100, revenue: 3925, profit: 1825, clients: 13 },
  { m: "июн 27", costs: 2100, revenue: 5475, profit: 3375, clients: 19 },
  { m: "июл 27", costs: 2100, revenue: 7675, profit: 5575, clients: 27 },
  { m: "авг 27", costs: 2100, revenue: 9900, profit: 7800, clients: 36 },
  { m: "сен 27", costs: 2100, revenue: 12350, profit: 10250, clients: 46 },
  { m: "окт 27", costs: 2100, revenue: 14600, profit: 12500, clients: 56 },
  { m: "ноя 27", costs: 2100, revenue: 16850, profit: 14750, clients: 66 },
  { m: "дек 27", costs: 2100, revenue: 19100, profit: 17000, clients: 76 },
];

const kpi = [
  { id: "s5c.k1", Icon: Wallet, label: "Расходы за период", value: "26,9 млн руб.", note: "окт 2026 — дек 2027" },
  { id: "s5c.k2", Icon: TrendingUp, label: "Выручка за период", value: "95,5 млн руб.", note: "нарастающая подписка" },
  { id: "s5c.k3", Icon: Users, label: "Клиентов к дек 2027", value: "76", note: "в среднем 150 сотрудников" },
  { id: "s5c.k4", Icon: Flag, label: "Выход в прибыль", value: "апрель 2027", note: "7-й месяц плана" },
];

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ");

export default function Slide5cPlan() {
  return (
    <SlideLayout kicker="Экономика · План развития · 15 мес">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[60px]">
        <Editable
          id="s5c.title"
          as="h2"
          defaultValue="План экономического развития: от инвестиций к прибыли"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s5c.lead"
          as="p"
          defaultValue="Базовый пакет — 900 руб. за сотрудника в месяц; типовой клиент 150–250 сотрудников. Точка безубыточности — апрель 2027."
          className="mt-2 text-[19px] text-[#1B1D22]/70"
        />

        <div className="mt-5 grid grid-cols-4 gap-4">
          {kpi.map((k) => (
            <div
              key={k.id}
              className="rounded-2xl bg-white p-4"
              style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center gap-2.5 text-[#8C6A1A]">
                <k.Icon size={20} strokeWidth={1.6} />
                <div className="text-[15px] font-medium">{k.label}</div>
              </div>
              <Editable
                id={`${k.id}.v`}
                defaultValue={k.value}
                as="div"
                className="mt-2 text-[30px] font-bold leading-none tabular-nums text-[#1B1D22]"
              />
              <div className="mt-2 text-[15px] text-[#1B1D22]/60">{k.note}</div>
            </div>
          ))}
        </div>

        <div
          className="mt-5 flex-1 rounded-2xl bg-white p-5"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
        >
          <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
            Выручка · расходы · прибыль, тыс. руб. / мес.
          </div>
          <div className="h-[330px]">
            <ResponsiveContainer>
              <ComposedChart data={plan} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#D5A52A" strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="m" tick={{ fill: "#1B1D22", fontSize: 15 }} tickLine={false} />
                <YAxis
                  tick={{ fill: "#1B1D22", fontSize: 15 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmt(v)}
                />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #D5A52A", fontSize: 15 }}
                  formatter={(value: number, name: string) => [`${fmt(value)} тыс. руб.`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 15, paddingTop: 6 }} />
                <Bar name="Выручка" dataKey="revenue" fill="#D5A52A" radius={[4, 4, 0, 0]} />
                <Bar name="Расходы" dataKey="costs" fill="#C6BCA4" radius={[4, 4, 0, 0]} />
                <Line
                  name="Прибыль"
                  dataKey="profit"
                  type="monotone"
                  stroke="#5A4410"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#5A4410" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Editable
          id="s5c.foot"
          as="div"
          multiline
          defaultValue="Модель без внешнего долга: постоянные расходы 2,1 млн руб./мес. с февраля 2027, накопленная прибыль за период — 43,2 млн руб."
          className="mt-3 text-[15px] text-[#1B1D22]/60"
        />
        <div className="mt-1 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s5c.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5c.foot.page" defaultValue="07 / 10" />
        </div>
      </div>
    </SlideLayout>
  );
}
