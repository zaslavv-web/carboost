import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import { Percent, Users, Wallet, TrendingUp, PieChart, Coins, Target, Clock } from "lucide-react";

// Material 3 — светлые поверхности, elevation-1, скругление 12/16, единый accent
const params = [
  { id: "s5b.p1", Icon: Percent, label: "Валовая маржа", value: "72 %" },
  { id: "s5b.p2", Icon: Users, label: "Сотрудников у клиента", value: "200" },
  { id: "s5b.p3", Icon: Wallet, label: "Цена / сотрудник / мес.", value: "2 000 руб." },
];

const metrics = [
  { id: "s5b.m1", Icon: TrendingUp, label: "Доход / клиент · год", value: "4,8 млн руб.", note: "200 × 2 000 × 12" },
  { id: "s5b.m2", Icon: PieChart, label: "Валовая прибыль / клиент", value: "3 456 тыс. руб.", note: "За вычетом инфры, ИИ, поддержки" },
  { id: "s5b.m3", Icon: Coins, label: "LTV (3 года)", value: "10 368 тыс. руб.", note: "≈ 7,5× к CAC" },
];

const cac = [
  { id: "s5b.c1", Icon: Target, label: "Стоимость привлечения", value: "1 375 тыс. руб.", note: "5 500 тыс. ÷ 4 клиента" },
  { id: "s5b.c2", Icon: Clock, label: "Окупаемость", value: "5 мес.", note: "Маржинальность одного клиента" },
];

function M3Card({
  Icon,
  label,
  value,
  note,
  large = false,
}: {
  Icon: any;
  label: string;
  value: string;
  note?: string;
  large?: boolean;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center gap-2.5 text-[#8C6A1A]">
        <Icon size={20} strokeWidth={1.6} />
        <div className="text-[15px] font-medium tracking-[0.02em]">{label}</div>
      </div>
      <div
        className={`mt-3 font-bold tabular-nums text-[#1B1D22] ${large ? "text-[44px]" : "text-[32px]"} leading-none`}
      >
        {value}
      </div>
      {note && <div className="mt-2 text-[15px] text-[#1B1D22]/60">{note}</div>}
    </div>
  );
}

export default function Slide5bRevenue() {
  return (
    <SlideLayout kicker="Экономика · Планируемый доход">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[65px]">
        <Editable
          id="s5b.title"
          as="h2"
          defaultValue="Планируемый доход и юнит-экономика"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s5b.lead"
          as="p"
          defaultValue="Основная модель монетизации — подписка за сотрудника в месяц."
          className="mt-2 text-[19px] text-[#1B1D22]/70"
        />

        {/* Params — Material chips-like */}
        <div className="mt-6 rounded-2xl bg-[#D5A52A]/10 p-4">
          <div className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
            Параметры модели
          </div>
          <div className="grid grid-cols-3 gap-4">
            {params.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              >
                <M3Card Icon={p.Icon} label={p.label} value={p.value} large />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          {metrics.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
            >
              <M3Card Icon={m.Icon} label={m.label} value={m.value} note={m.note} />
            </motion.div>
          ))}
        </div>

        {/* CAC block */}
        <div className="mt-4 rounded-2xl bg-[#D5A52A]/10 p-4">
          <div className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
            Привлечение клиента и окупаемость
          </div>
          <div className="grid grid-cols-2 gap-4">
            {cac.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
              >
                <M3Card Icon={c.Icon} label={c.label} value={c.value} note={c.note} large />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-3 flex items-center justify-between text-[15px] text-[#1B1D22]/60">
          <Editable id="s5b.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s5b.foot.page" defaultValue="06 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
