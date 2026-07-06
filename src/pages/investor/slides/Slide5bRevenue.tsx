import { useMemo } from "react";
import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import NumericEditable from "../deck/NumericEditable";
import { useDeckNumber } from "../deck/DeckContentContext";

const fmt = (v: number) => Math.round(v).toLocaleString("ru-RU");

export default function Slide5bRevenue() {
  // редактируемые параметры
  const seatPrice = useDeckNumber("s5b.seatPrice", 2000); // ₽ / сотр / мес
  const avgSeats = useDeckNumber("s5b.avgSeats", 200);    // сотр. у клиента
  const marginPct = useDeckNumber("s5b.margin", 72);      // %
  const clientsY1 = useDeckNumber("s5b.clientsY1", 4);
  const clientsY2 = useDeckNumber("s5b.clientsY2", 12);
  const clientsY3 = useDeckNumber("s5b.clientsY3", 30);

  // бюджет на продвижение — из слайда затрат, чтобы стоимость привлечения была честной
  const promoY = useDeckNumber("s5.promo.0.v", 1200)
               + useDeckNumber("s5.promo.1.v", 1200)
               + useDeckNumber("s5.promo.2.v", 800)
               + useDeckNumber("s5.promo.3.v", 500)
               + useDeckNumber("s5.promo.4.v", 300);
  const infraY = useDeckNumber("s5.infra", 1500);
  const teamY = (useDeckNumber("s5.team.0.monthly", 500)
              + useDeckNumber("s5.team.1.monthly", 500)
              + useDeckNumber("s5.team.2.monthly", 250)
              + useDeckNumber("s5.team.3.monthly", 400)) * 12;
  const totalCosts = promoY + infraY + teamY;

  const calc = useMemo(() => {
    const margin = marginPct / 100;
    const arpuYear = (seatPrice * avgSeats * 12) / 1000; // тыс ₽
    const grossPerClient = arpuYear * margin;
    const cac = clientsY1 > 0 ? promoY / clientsY1 : 0;
    const payback = grossPerClient > 0 ? Math.ceil(cac / (grossPerClient / 12)) : 0;
    const ltv = grossPerClient * 3;
    const revenueY1 = arpuYear * clientsY1;
    const revenueY2 = arpuYear * clientsY2;
    const revenueY3 = arpuYear * clientsY3;
    const breakEven = grossPerClient > 0 ? Math.ceil(totalCosts / grossPerClient) : 0;
    return { arpuYear, grossPerClient, cac, payback, ltv, revenueY1, revenueY2, revenueY3, breakEven, margin };
  }, [seatPrice, avgSeats, marginPct, clientsY1, clientsY2, clientsY3, promoY, totalCosts]);

  const card = "rounded-2xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm";
  const highlight = "rounded-2xl border border-[#D5A52A]/50 bg-[#D5A52A]/10 p-5 shadow-sm";

  return (
    <SlideLayout kicker="Экономика · Планируемый доход">
      <div className="grid h-full grid-cols-12 gap-5 px-14 pt-28 pb-10">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#1B1D22]">
            <Editable id="s5b.h1.a" defaultValue="Планируемый " />
            <span className="italic text-[#8C6A1A]"><Editable id="s5b.h1.b" defaultValue="доход" /></span>
            <Editable id="s5b.h1.c" defaultValue=" и юнит-экономика" />
          </h2>
          <Editable id="s5b.lead" as="p" multiline
            defaultValue="Все ключевые параметры редактируются — метрики пересчитываются автоматически. Модель: подписка за сотрудника в месяц."
            className="mt-2 max-w-[1500px] text-[18px] text-[#1B1D22]/70" />
        </div>

        {/* Параметры */}
        <div className={`col-span-6 ${card}`}>
          <div className="text-[20px] font-semibold text-[#1B1D22]">
            <Editable id="s5b.params.title" defaultValue="Параметры модели" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-3">
              <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">
                <Editable id="s5b.pr.1.k" defaultValue="Цена за сотрудника / мес" />
              </div>
              <div className="mt-2 font-['Instrument_Serif'] text-[32px] text-[#1B1D22]">
                ₽ <NumericEditable id="s5b.seatPrice" defaultValue={2000} />
              </div>
            </div>
            <div className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-3">
              <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">
                <Editable id="s5b.pr.2.k" defaultValue="Сотрудников у клиента" />
              </div>
              <div className="mt-2 font-['Instrument_Serif'] text-[32px] text-[#1B1D22]">
                <NumericEditable id="s5b.avgSeats" defaultValue={200} />
              </div>
            </div>
            <div className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-3">
              <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">
                <Editable id="s5b.pr.3.k" defaultValue="Валовая маржа, %" />
              </div>
              <div className="mt-2 font-['Instrument_Serif'] text-[32px] text-[#1B1D22]">
                <NumericEditable id="s5b.margin" defaultValue={72} /> %
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4">
            {[
              { k: "Средний доход с клиента / год", v: `₽ ${(calc.arpuYear / 1000).toFixed(1)} млн`,
                s: `${fmt(avgSeats)} сотр × ${fmt(seatPrice)} ₽ × 12` },
              { k: "Валовая прибыль с клиента", v: `₽ ${fmt(calc.grossPerClient)} тыс.`,
                s: `после инфраструктуры, ИИ, поддержки` },
              { k: "Пожизненная ценность (3 года)", v: `₽ ${fmt(calc.ltv)} тыс.`,
                s: `${(calc.ltv / (calc.cac || 1)).toFixed(1)}× к стоимости привлечения` },
            ].map((m) => (
              <div key={m.k} className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-3">
                <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">{m.k}</div>
                <div className="mt-1 font-['Instrument_Serif'] text-[24px] leading-none text-[#1B1D22]">{m.v}</div>
                <div className="mt-1 text-[11px] text-[#1B1D22]/60">{m.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Стоимость привлечения и окупаемость */}
        <div className={`col-span-6 ${card}`}>
          <div className="text-[20px] font-semibold text-[#1B1D22]">
            <Editable id="s5b.cac.title" defaultValue="Привлечение клиента и окупаемость" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-4">
              <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Стоимость привлечения</div>
              <div className="mt-2 font-['Instrument_Serif'] text-[42px] leading-none text-[#1B1D22]">
                ₽ {fmt(calc.cac)} <span className="text-[24px] opacity-70">тыс.</span>
              </div>
              <div className="mt-2 text-[12px] text-[#1B1D22]/65">
                Бюджет продвижения {fmt(promoY)} тыс. ₽ ÷ {clientsY1} клиента 1-го года
              </div>
            </div>
            <div className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-4">
              <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Окупаемость</div>
              <div className="mt-2 font-['Instrument_Serif'] text-[42px] leading-none text-[#1B1D22]">
                {calc.payback} <span className="text-[24px] opacity-70">мес</span>
              </div>
              <div className="mt-2 text-[12px] text-[#1B1D22]/65">
                Маржинальная — на одного клиента, при марже {marginPct}%
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-[#D5A52A]/40 bg-[#D5A52A]/10 p-4">
            <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Расшифровка формулы</div>
            <div className="mt-1 text-[14px] leading-[1.5] text-[#1B1D22]/85">
              Средний доход с клиента = цена × сотрудники × 12 мес.<br/>
              Валовая прибыль = средний доход × маржа.<br/>
              Стоимость привлечения = бюджет продвижения ÷ число новых клиентов.<br/>
              Окупаемость = стоимость привлечения ÷ (валовая прибыль ÷ 12).
            </div>
          </div>
        </div>

        {/* План по годам */}
        <div className={`col-span-8 ${card}`}>
          <div className="flex items-baseline justify-between">
            <div className="text-[20px] font-semibold text-[#1B1D22]">
              <Editable id="s5b.plan.title" defaultValue="Планируемый рост дохода" />
            </div>
            <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">клиенты редактируются</div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {[
              { y: "1-й год", nid: "s5b.clientsY1", def: 4, rev: calc.revenueY1 },
              { y: "2-й год", nid: "s5b.clientsY2", def: 12, rev: calc.revenueY2 },
              { y: "3-й год", nid: "s5b.clientsY3", def: 30, rev: calc.revenueY3 },
            ].map((r) => (
              <div key={r.y} className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-4">
                <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">{r.y}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-['Instrument_Serif'] text-[36px] text-[#1B1D22]">
                    <NumericEditable id={r.nid} defaultValue={r.def} />
                  </span>
                  <span className="text-[14px] text-[#1B1D22]/65">клиентов</span>
                </div>
                <div className="mt-2 text-[16px] text-[#1B1D22]/80">
                  Годовая выручка ≈ <span className="text-[#8C6A1A] font-semibold">₽ {(r.rev / 1000).toFixed(1)} млн</span>
                </div>
                <div className="mt-1 text-[12px] text-[#1B1D22]/60">
                  Валовая прибыль ≈ ₽ {((r.rev * calc.margin) / 1000).toFixed(1)} млн
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Точка безубыточности */}
        <div className={`col-span-4 ${highlight}`}>
          <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Точка безубыточности</div>
          <div className="mt-1 font-['Instrument_Serif'] text-[54px] leading-none text-[#1B1D22]">
            {calc.breakEven} клиентов
          </div>
          <div className="mt-2 text-[13px] text-[#1B1D22]/75 leading-[1.5]">
            При марже {marginPct}% и годовых затратах ≈ ₽ {(totalCosts / 1000).toFixed(1)} млн операционная безубыточность достигается в течение 2-го — 3-го квартала 2-го года.
          </div>
        </div>

        <div className="col-span-12 text-[12px] text-[#1B1D22]/60">
          <Editable id="s5b.foot" multiline
            defaultValue="Все цифры оценочные и подлежат уточнению. Меняйте параметры — метрики пересчитаются." />
        </div>
      </div>
    </SlideLayout>
  );
}
