import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";

/**
 * Слайд 06 — бюджет проекта (таблица из финансовой модели).
 * Источник: «пик роста бюджет-2.xlsx», лист «Бюджет». Все суммы в тыс. руб.
 */

const months = [
  { y: "2026", m: "окт" },
  { y: "", m: "ноя" },
  { y: "", m: "дек" },
  { y: "2027", m: "янв" },
  { y: "", m: "фев" },
  { y: "", m: "мар" },
  { y: "", m: "апр" },
  { y: "", m: "май" },
  { y: "", m: "июн" },
  { y: "", m: "июл" },
  { y: "", m: "авг" },
  { y: "", m: "сен" },
  { y: "", m: "окт" },
  { y: "", m: "ноя" },
  { y: "", m: "дек" },
];

type Row = {
  label: string;
  values: (number | null)[];
  total: number | null;
  kind?: "sum" | "cost" | "count" | "revenue" | "profit";
};

const rows: Row[] = [
  {
    label: "Итого расходы",
    kind: "sum",
    values: [550, 800, 1200, 1200, 2100, 2100, 2100, 2100, 2100, 2100, 2100, 2100, 2100, 2100, 2100],
    total: 26850,
  },
  { label: "Офис", kind: "cost", values: [150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150], total: 2250 },
  { label: "Продажник 1", kind: "cost", values: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200], total: 3000 },
  { label: "Продажник 2", kind: "cost", values: [null, null, null, null, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200], total: 2200 },
  { label: "Инфраструктура ИТ", kind: "cost", values: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], total: 1500 },
  { label: "IT-фрилансер", kind: "cost", values: [null, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250], total: 3500 },
  { label: "DevOps", kind: "cost", values: [null, null, null, null, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300], total: 3300 },
  { label: "Продакт-оунер", kind: "cost", values: [null, null, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400], total: 5200 },
  { label: "Руководитель компании", kind: "cost", values: [null, null, null, null, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400], total: 4400 },
  { label: "Реклама / PR", kind: "cost", values: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], total: 1500 },
  {
    label: "Новых клиентов (250 сотр.)",
    kind: "count",
    values: [null, 1, null, null, 2, 2, 3, 5, 6, 8, 9, 10, 10, 10, 10],
    total: 76,
  },
  {
    label: "Клиентов кумулятивно",
    kind: "count",
    values: [null, null, null, 1, 3, 5, 8, 13, 19, 27, 36, 46, 56, 66, 76],
    total: null,
  },
  {
    // Лист «доходы»: 300 сотрудников × 120 руб./мес = 36 тыс. руб. с клиента в месяц.
    label: "Выручка",
    kind: "revenue",
    values: [null, null, 36, 36, 108, 180, 288, 468, 684, 972, 1296, 1656, 2016, 2376, 2736],
    total: 12852,
  },
  {
    // Помесячно — выручка минус расходы, как в модели. Итог за период — сумма
    // этих месяцев (12 852 − 26 850). В самом файле в этой ячейке −39 498:
    // формула SUM(E22:Q22)−R4 вычитает расходы второй раз и теряет окт–ноя 2026.
    label: "Прибыль",
    kind: "profit",
    values: [-550, -800, -1164, -1164, -1992, -1920, -1812, -1632, -1416, -1128, -804, -444, -84, 276, 636],
    total: -13998,
  },
];

const nf = new Intl.NumberFormat("ru-RU");

function fmt(v: number | null, kind?: Row["kind"]) {
  if (v === null) return "–";
  if (kind === "count") return nf.format(v);
  if (v < 0) return `(${nf.format(Math.abs(v))})`;
  return nf.format(v);
}

function rowClasses(kind?: Row["kind"]) {
  switch (kind) {
    case "sum":
      return "bg-[#1B1D22]/[0.05] font-semibold text-[#1B1D22]";
    case "count":
      return "bg-[#D5A52A]/[0.08] text-[#1B1D22]/85";
    case "revenue":
      return "bg-[#D5A52A]/[0.16] font-semibold text-[#1B1D22]";
    case "profit":
      return "bg-[#1B1D22] font-bold text-[#F7F4EC]";
    default:
      return "text-[#1B1D22]/75";
  }
}

export default function Slide5bRevenue() {
  return (
    <SlideLayout kicker="Экономика · Бюджет проекта">
      <div className="flex h-full flex-col px-[70px] pt-[104px] pb-[60px]">
        <Editable
          id="s5b.title"
          as="h2"
          defaultValue="Бюджет проекта: расходы, выручка, прибыль"
          className="text-[42px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s5b.lead"
          as="p"
          defaultValue="Финансовая модель на 15 месяцев (окт. 2026 — дек. 2027). Все суммы — тыс. руб. Отрицательные значения в скобках."
          className="mt-1.5 text-[18px] text-[#1B1D22]/70"
        />

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 overflow-hidden rounded-2xl bg-white"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
        >
          <table className="w-full table-fixed border-collapse text-[16px] tabular-nums">
            <colgroup>
              <col style={{ width: 300 }} />
              {months.map((_, i) => (
                <col key={i} style={{ width: 87 }} />
              ))}
              <col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr className="bg-[#8C6A1A] text-[#F7F4EC]">
                <th className="px-4 py-3 text-left text-[15px] font-semibold tracking-[0.02em]">Статья</th>
                {months.map((mo, i) => (
                  <th key={i} className="px-1 py-2 text-center font-medium">
                    <div className="text-[13px] opacity-70">{mo.y || "\u00A0"}</div>
                    <div className="text-[15px]">{mo.m}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center">
                  <div className="text-[13px] opacity-70">итого</div>
                  <div className="text-[15px]">за период</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={`border-t border-[#1B1D22]/[0.06] ${rowClasses(r.kind)}`}>
                  <td className="px-4 py-[9px] text-left text-[16px]">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td
                      key={i}
                      className={`px-1 py-[9px] text-center ${v === null ? "opacity-30" : ""} ${
                        v !== null && v < 0 ? "text-[#C0392B]" : ""
                      } ${r.kind === "profit" && v !== null && v < 0 ? "text-[#F2A29B]" : ""}`}
                    >
                      {fmt(v, r.kind)}
                    </td>
                  ))}
                  <td className="px-2 py-[9px] text-center font-semibold">{fmt(r.total, r.kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <div className="mt-4 grid grid-cols-4 gap-4">
          {[
            { id: "s5b.k1", label: "Расходы за период", value: "26,9 млн руб." },
            { id: "s5b.k2", label: "Выручка за период", value: "12,9 млн руб." },
            { id: "s5b.k3", label: "Прибыль за период", value: "−14,0 млн руб." },
            { id: "s5b.k4", label: "Выход в плюс", value: "ноябрь 2027" },
          ].map((k) => (
            <div key={k.id} className="rounded-xl bg-[#D5A52A]/10 px-4 py-3">
              <div className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#8C6A1A]">{k.label}</div>
              <Editable
                id={k.id}
                defaultValue={k.value}
                className="mt-1 block text-[26px] font-bold tabular-nums text-[#1B1D22]"
              />
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 text-[15px] text-[#1B1D22]/55">
          <Editable id="s5b.foot.src" defaultValue="Источник: финансовая модель «Пик роста», лист «Бюджет»" />
          <Editable id="s5b.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5b.foot.page" defaultValue="06 / 11" />
        </div>
      </div>
    </SlideLayout>
  );
}
