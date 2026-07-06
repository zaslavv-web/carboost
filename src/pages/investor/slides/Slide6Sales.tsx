import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import { PlayCircle, FileSignature, Rocket } from "lucide-react";

const stages = [
  {
    id: "s6.st.1",
    Icon: PlayCircle,
    weeks: "2–4 НЕДЕЛИ",
    title: "Работа с демо",
    text: "Демо, песочница, ответы на вопросы, согласование сценария внедрения.",
    color: "#8C6A1A",
  },
  {
    id: "s6.st.2",
    Icon: FileSignature,
    weeks: "4–6 НЕДЕЛИ",
    title: "Подтверждение и подключение",
    text: "Согласование договора и техническая поддержка подключения.",
    color: "#B78C22",
  },
  {
    id: "s6.st.3",
    Icon: Rocket,
    weeks: "6–8 НЕДЕЛИ",
    title: "Боевой запуск · оплата",
    text: "Миграция данных, обучение админов, приёмка и первая оплата.",
    color: "#D5A52A",
  },
];

export default function Slide6Sales() {
  return (
    <SlideLayout kicker="Продажи · График получения оплаты">
      <div className="flex h-full flex-col px-[90px] pt-[110px] pb-[80px]">
        <Editable
          id="s6.title"
          as="h2"
          defaultValue="От первого демо до оплаты — 6–8 недель"
          className="font-['Instrument_Serif'] text-[64px] leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s6.lead"
          as="p"
          multiline
          defaultValue="Целевой клиент — компании со 100+ сотрудников. Модель — подписка с бесплатным пилотом."
          className="mt-3 text-[26px] text-[#1B1D22]/70"
        />

        {/* Таймлайн */}
        <div className="mt-10 rounded-3xl border border-[#D5A52A]/30 bg-white p-10 shadow-sm">
          <div className="relative">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "left" }}
              className="absolute left-0 right-0 top-4 h-2 rounded-full bg-gradient-to-r from-[#8C6A1A]/40 via-[#B78C22] to-[#D5A52A]"
            />
            <div className="relative h-20">
              {["0", "2", "4", "6", "8"].map((w, i) => (
                <div
                  key={w}
                  className="absolute -top-2 flex flex-col items-center"
                  style={{ left: `${i * 25}%`, transform: "translateX(-50%)" }}
                >
                  <div className="h-7 w-7 rounded-full border-4 border-white bg-[#8C6A1A] shadow" />
                  <div className="mt-3 text-[24px] font-mono text-[#1B1D22]/75">неделя {w}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-6">
            {stages.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
                className="rounded-2xl border-2 p-6"
                style={{ borderColor: `${s.color}66`, background: `${s.color}0d` }}
              >
                <div className="flex items-center gap-3">
                  <s.Icon size={28} strokeWidth={1.8} style={{ color: s.color }} />
                  <Editable
                    id={`${s.id}.weeks`}
                    defaultValue={s.weeks}
                    as="div"
                    className="text-[24px] uppercase tracking-widest"
                    {...{ style: { color: s.color } } as any}
                  />
                </div>
                <Editable
                  id={`${s.id}.title`}
                  defaultValue={s.title}
                  as="div"
                  className="mt-2 text-[30px] font-semibold text-[#1B1D22]"
                />
                <Editable
                  id={`${s.id}.text`}
                  defaultValue={s.text}
                  as="div"
                  multiline
                  className="mt-3 text-[24px] leading-[1.35] text-[#1B1D22]/80"
                />
              </motion.div>
            ))}
          </div>
        </div>

        <Editable
          id="s6.summary"
          as="div"
          multiline
          defaultValue="Итоговый цикл сделки — 6–8 недель до первой оплаты. Конверсия «демо → оплата» ≈ 55%."
          className="mt-6 text-[26px] font-semibold text-[#1B1D22]"
        />
        <div className="mt-3 flex items-center justify-between text-[22px] text-[#1B1D22]/60">
          <Editable id="s6.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s6.foot.page" defaultValue="07 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
