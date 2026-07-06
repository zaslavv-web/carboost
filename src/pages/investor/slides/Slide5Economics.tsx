import { useMemo } from "react";
import SlideLayout from "../SlideLayout";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import Editable from "../deck/Editable";
import NumericEditable from "../deck/NumericEditable";
import { useDeckCtx, useDeckNumber } from "../deck/DeckContentContext";
import { Plus, X } from "lucide-react";

// ==== Defaults ====
const teamDefaults = [
  { id: "s5.team.0", role: "2 × Разработчик (fullstack)", monthly: 500 },
  { id: "s5.team.1", role: "1 × Технический лидер", monthly: 500 },
  { id: "s5.team.2", role: "1 × Руководитель продаж (+ бонус %)", monthly: 250 },
  { id: "s5.team.3", role: "1 × Владелец продукта", monthly: 400 },
];
const promoDefaults = [
  { id: "s5.promo.0", name: "Контент, поисковый трафик, соцсети", v: 1_200 },
  { id: "s5.promo.1", name: "Реклама и таргетинг", v: 1_200 },
  { id: "s5.promo.2", name: "Отраслевые конференции", v: 800 },
  { id: "s5.promo.3", name: "Пиар и партнёрства", v: 500 },
  { id: "s5.promo.4", name: "Демо-стенд и материалы", v: 300 },
];
const INFRA_DEFAULT = 1_500;

const fmt = (v: number) => Math.round(v).toLocaleString("ru-RU");

const raiseLow = 5_000;
const raiseHigh = 10_000;

export default function Slide5Economics() {
  const { values, setValue, editMode } = useDeckCtx();

  const team = teamDefaults.map((r) => ({
    ...r,
    monthly: useDeckNumber(`${r.id}.monthly`, r.monthly),
  }));

  const extras = useMemo(() => {
    try {
      const parsed = JSON.parse(values["s5.team.extras"] ?? "[]");
      if (!Array.isArray(parsed)) return [] as { id: string; role: string; monthly: number }[];
      return parsed as { id: string; role: string; monthly: number }[];
    } catch {
      return [] as { id: string; role: string; monthly: number }[];
    }
  }, [values]);

  const extrasResolved = extras.map((e) => ({
    ...e,
    role: values[`${e.id}.role`] ?? e.role,
    monthly: Number(values[`${e.id}.monthly`] ?? e.monthly) || 0,
  }));

  const addExtra = () => {
    const id = `s5.team.x.${Date.now()}`;
    const next = [...extras, { id, role: "Новый сотрудник", monthly: 100 }];
    setValue("s5.team.extras", JSON.stringify(next));
  };
  const removeExtra = (id: string) => {
    const next = extras.filter((e) => e.id !== id);
    setValue("s5.team.extras", JSON.stringify(next));
    setValue(`${id}.role`, "");
    setValue(`${id}.monthly`, "");
  };

  const promo = promoDefaults.map((r) => ({
    ...r,
    v: useDeckNumber(`${r.id}.v`, r.v),
  }));
  const infraYear = useDeckNumber("s5.infra", INFRA_DEFAULT);

  const calc = useMemo(() => {
    const teamMonthly = team.reduce((s, r) => s + r.monthly, 0) + extrasResolved.reduce((s, r) => s + r.monthly, 0);
    const teamYear = teamMonthly * 12;
    const promoYear = promo.reduce((s, r) => s + r.v, 0);
    const total = teamYear + promoYear + infraYear;
    const donut = [
      { name: "Команда (фонд оплаты труда)", v: teamYear, fill: "#D5A52A" },
      { name: "Продвижение", v: promoYear, fill: "#8C6A1A" },
      { name: "Инфраструктура и ИИ", v: infraYear, fill: "#5A4410" },
    ];
    return { teamMonthly, teamYear, promoYear, total, donut };
  }, [team, promo, infraYear, extrasResolved]);

  const { teamMonthly, teamYear, promoYear, total, donut } = calc;

  const cellBg = "bg-white";
  const cellBorder = "border-[#D5A52A]/30";
  const rowBorder = "border-[#D5A52A]/20";

  return (
    <SlideLayout kicker="Экономика · Затраты · 12 мес">
      <div className="grid h-full grid-cols-12 gap-5 px-14 pt-28 pb-10">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#1B1D22]">
            <Editable id="s5.h1.a" defaultValue="Бюджет и " />
            <span className="italic text-[#8C6A1A]"><Editable id="s5.h1.b" defaultValue="структура затрат" /></span>
            <Editable id="s5.h1.c" defaultValue=" на год" />
          </h2>
        </div>

        {/* Team */}
        <div className={`col-span-4 rounded-2xl border ${cellBorder} ${cellBg} p-5 shadow-sm`}>
          <div className="flex items-baseline justify-between">
            <Editable id="s5.team.title" defaultValue="Команда · фонд оплаты труда" as="div"
              className="text-[20px] font-semibold text-[#1B1D22]" />
            <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">мес, тыс. ₽</div>
          </div>
          <table className="mt-2 w-full text-[14px]">
            <tbody>
              {team.map((r) => (
                <tr key={r.id} className={`border-b ${rowBorder} last:border-0`}>
                  <td className="py-1.5 text-[#1B1D22]/85">
                    <Editable id={`${r.id}.role`} defaultValue={r.role} />
                  </td>
                  <td className="py-1.5 text-right font-mono text-[#1B1D22]">
                    <NumericEditable id={`${r.id}.monthly`} defaultValue={teamDefaults.find(t => t.id === r.id)!.monthly} />
                  </td>
                </tr>
              ))}
              {extrasResolved.map((r) => (
                <tr key={r.id} className={`border-b ${rowBorder} last:border-0`}>
                  <td className="py-1.5 text-[#1B1D22]/85">
                    <div className="flex items-center gap-1.5">
                      {editMode && (
                        <button type="button" onClick={() => removeExtra(r.id)}
                          className="text-[#8C6A1A]/70 hover:text-[#8C6A1A]" aria-label="Удалить сотрудника">
                          <X size={12} />
                        </button>
                      )}
                      <Editable id={`${r.id}.role`} defaultValue={r.role} />
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-mono text-[#1B1D22]">
                    <NumericEditable id={`${r.id}.monthly`} defaultValue={r.monthly} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editMode && (
            <button type="button" onClick={addExtra}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-[#8C6A1A]/60 px-2 py-1 text-[12px] text-[#8C6A1A] hover:bg-[#D5A52A]/10">
              <Plus size={12} /> Добавить сотрудника
            </button>
          )}
          <div className="mt-3 border-t border-[#D5A52A]/30 pt-2">
            <div className="flex items-baseline justify-between text-[14px] text-[#1B1D22]/70">
              <span>Мес</span>
              <span className="font-mono text-[#1B1D22]">{fmt(teamMonthly)} тыс. ₽</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] text-[#1B1D22]/70">Год</span>
              <span className="font-['Instrument_Serif'] text-[26px] text-[#8C6A1A]">
                {fmt(teamYear)} тыс. ₽
              </span>
            </div>
          </div>
        </div>

        {/* Promo */}
        <div className={`col-span-4 rounded-2xl border ${cellBorder} ${cellBg} p-5 shadow-sm`}>
          <div className="flex items-baseline justify-between">
            <Editable id="s5.promo.title" defaultValue="Продвижение · 12 мес" as="div"
              className="text-[20px] font-semibold text-[#1B1D22]" />
            <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">тыс. ₽ / год</div>
          </div>
          <table className="mt-2 w-full text-[14px]">
            <tbody>
              {promo.map((r) => (
                <tr key={r.id} className={`border-b ${rowBorder} last:border-0`}>
                  <td className="py-1.5 text-[#1B1D22]/85">
                    <Editable id={`${r.id}.name`} defaultValue={r.name} />
                  </td>
                  <td className="py-1.5 text-right font-mono text-[#1B1D22]">
                    <NumericEditable id={`${r.id}.v`} defaultValue={promoDefaults.find(t => t.id === r.id)!.v} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-[#1B1D22]/85">
                  <Editable id="s5.infra.name" defaultValue="Инфраструктура и ИИ" />
                </td>
                <td className="py-1.5 text-right font-mono text-[#1B1D22]">
                  <NumericEditable id="s5.infra" defaultValue={INFRA_DEFAULT} />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex items-baseline justify-between border-t border-[#D5A52A]/30 pt-2">
            <span className="text-[14px] text-[#1B1D22]/70">Итого продвижение + инфраструктура</span>
            <span className="font-['Instrument_Serif'] text-[26px] text-[#8C6A1A]">
              {fmt(promoYear + infraYear)} тыс. ₽
            </span>
          </div>
        </div>

        {/* Donut & total */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/50 bg-[#D5A52A]/10 p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Итого бюджет · год</div>
          <div className="mt-1 font-['Instrument_Serif'] text-[60px] leading-none text-[#1B1D22]">
            ₽ {(total / 1000).toFixed(1)} млн
          </div>
          <div className="mt-1 text-[14px] text-[#1B1D22]/70">
            {fmt(total)} тыс. ₽ · раунд-запрос {raiseLow / 1000}–{raiseHigh / 1000} млн ₽
          </div>
          <div className="mt-2 h-[210px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donut} dataKey="v" nameKey="name"
                  innerRadius={45} outerRadius={80} paddingAngle={4}
                  stroke="#F7F4EC" strokeWidth={2} minAngle={12}>
                  {donut.map((d, i) => (<Cell key={i} fill={d.fill} />))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #D5A52A", borderRadius: 8, color: "#1B1D22", fontSize: 13, padding: "8px 10px" }}
                  labelStyle={{ color: "#1B1D22", fontWeight: 600 }}
                  itemStyle={{ color: "#1B1D22" }}
                  formatter={(value: number, name: string) => [`${fmt(value)} тыс. ₽`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-[13px] text-[#1B1D22]/85">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} />
                  <span>{d.name}</span>
                </div>
                <span className="font-mono text-[#1B1D22]">{fmt(d.v)} тыс. ₽</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 text-[12px] text-[#1B1D22]/60">
          <Editable id="s5.foot" multiline
            defaultValue="Все цифры оценочные, подлежат уточнению. Валюта — рубли (тыс. / млн). Числа в таблицах ФОТ и Продвижения редактируются в режиме ✎ — сумма пересчитывается автоматически." />
        </div>
      </div>
    </SlideLayout>
  );
}
