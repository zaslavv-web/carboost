import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";

const params = [
  { id: "s5b.p1", label: "ВАЛОВАЯ МАРЖА", value: "72 %" },
  { id: "s5b.p2", label: "СОТРУДНИКОВ У КЛИЕНТА", value: "200" },
  { id: "s5b.p3", label: "ЦЕНА ЗА СОТРУДНИКА / МЕС", value: "₽ 2 000" },
];

const metrics = [
  { id: "s5b.m1", label: "СРЕДНИЙ ДОХОД / КЛИЕНТ · ГОД", value: "₽ 4,8 млн", note: "(200 × 2 000 × 12)" },
  { id: "s5b.m2", label: "ВАЛОВАЯ ПРИБЫЛЬ / КЛИЕНТ", value: "₽ 3 456 тыс.", note: "(За вычетом инфраструктуры, ИИ, поддержки)" },
  { id: "s5b.m3", label: "LTV (3 года)", value: "₽ 10 368 тыс.", note: "(≈ 7,5× к CAC)" },
];

const cac = [
  { id: "s5b.c1", label: "СТОИМОСТЬ ПРИВЛЕЧЕНИЯ", value: "₽ 1 375 тыс.", note: "(5 500 тыс. ÷ 4 клиента)" },
  { id: "s5b.c2", label: "ОКУПАЕМОСТЬ", value: "5 мес", note: "(Маржинальность за одного клиента)" },
];

export default function Slide5bRevenue() {
  return (
    <SlideLayout kicker="Экономика · Планируемый доход">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s5b.title"
          as="h2"
          defaultValue="Планируемый доход и юнит-экономика"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s5b.lead"
          as="p"
          defaultValue="Основная модель монетизации – подписка за человека в месяц."
          className="mt-3 text-[26px] text-[#1B1D22]/70"
        />

        {/* Параметры модели */}
        <div className="mt-6 rounded-2xl border border-[#D5A52A]/40 bg-white p-6 shadow-sm">
          <Editable
            id="s5b.params.title"
            defaultValue="Параметры модели"
            as="div"
            className="text-[26px] font-semibold text-[#1B1D22]"
          />
          <div className="mt-4 grid grid-cols-3 gap-5">
            {params.map((p) => (
              <div key={p.id} className="rounded-xl border border-[#D5A52A]/30 bg-[#F7F4EC] p-5">
                <Editable
                  id={`${p.id}.l`}
                  defaultValue={p.label}
                  as="div"
                  className="text-[22px] uppercase tracking-widest text-[#8C6A1A] leading-[1.2]"
                />
                <Editable
                  id={`${p.id}.v`}
                  defaultValue={p.value}
                  as="div"
                  className="mt-3 font-['Instrument_Serif'] text-[56px] leading-none text-[#1B1D22]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 3 метрики дохода */}
        <div className="mt-5 grid grid-cols-3 gap-5">
          {metrics.map((m) => (
            <div key={m.id} className="rounded-xl border border-[#D5A52A]/30 bg-white p-5 shadow-sm">
              <Editable
                id={`${m.id}.l`}
                defaultValue={m.label}
                as="div"
                className="text-[22px] uppercase tracking-widest text-[#8C6A1A] leading-[1.2]"
              />
              <Editable
                id={`${m.id}.v`}
                defaultValue={m.value}
                as="div"
                className="mt-2 font-['Instrument_Serif'] text-[44px] leading-none text-[#1B1D22]"
              />
              <Editable
                id={`${m.id}.n`}
                defaultValue={m.note}
                as="div"
                className="mt-2 text-[22px] text-[#1B1D22]/65"
              />
            </div>
          ))}
        </div>

        {/* CAC блок */}
        <div className="mt-5 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/10 p-6">
          <Editable
            id="s5b.cac.title"
            defaultValue="Привлечение клиента и окупаемость"
            as="div"
            className="text-[26px] font-semibold text-[#1B1D22]"
          />
          <div className="mt-4 grid grid-cols-2 gap-5">
            {cac.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#D5A52A]/30 bg-white p-5">
                <Editable
                  id={`${c.id}.l`}
                  defaultValue={c.label}
                  as="div"
                  className="text-[22px] uppercase tracking-widest text-[#8C6A1A] leading-[1.2]"
                />
                <Editable
                  id={`${c.id}.v`}
                  defaultValue={c.value}
                  as="div"
                  className="mt-2 font-['Instrument_Serif'] text-[48px] leading-none text-[#1B1D22]"
                />
                <Editable
                  id={`${c.id}.n`}
                  defaultValue={c.note}
                  as="div"
                  className="mt-2 text-[22px] text-[#1B1D22]/65"
                />
              </div>
            ))}
          </div>
        </div>

        <Editable
          id="s5b.foot"
          as="div"
          multiline
          defaultValue="Формула: доход = цена × сотрудники × 12; прибыль = доход × маржа; окупаемость = CAC ÷ (прибыль ÷ 12)."
          className="mt-4 text-[22px] text-[#1B1D22]/60"
        />
        <div className="mt-2 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s5b.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5b.foot.page" defaultValue="06 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
