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
    text: "Демо, песочница, ответы на вопросы, согласование сценария.",
    color: "#8C6A1A",
    progress: 0.33,
  },
  {
    id: "s6.st.2",
    Icon: FileSignature,
    weeks: "4–6 НЕДЕЛИ",
    title: "Подтверждение · подключение",
    text: "Согласование договора и техническая поддержка подключения.",
    color: "#B78C22",
    progress: 0.66,
  },
  {
    id: "s6.st.3",
    Icon: Rocket,
    weeks: "6–8 НЕДЕЛИ",
    title: "Боевой запуск · оплата",
    text: "Миграция данных, обучение админов, приёмка и первая оплата.",
    color: "#D5A52A",
    progress: 1,
  },
];

export default function Slide6Sales() {
  return (
    <SlideLayout kicker="Продажи · График получения оплаты">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[60px]">
        <Editable
          id="s6.title"
          as="h2"
          defaultValue="От первого демо до оплаты — 6–8 недель"
          className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
        />
        <Editable
          id="s6.lead"
          as="p"
          multiline
          defaultValue="Целевой клиент — компании со 100+ сотрудников. Модель — подписка с бесплатным пилотом."
          className="mt-2 text-[20px] text-[#1B1D22]/70"
        />

        {/* Таймлайн — все точки и подписи умещаются в плашку */}
        <div className="mt-6 rounded-3xl border border-[#D5A52A]/30 bg-white px-10 py-8 shadow-sm">
          <div className="relative px-3">
            {/* Линия между центрами крайних точек */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "left" }}
              className="pointer-events-none absolute left-3 right-3 top-3 h-1.5 rounded-full bg-gradient-to-r from-[#8C6A1A]/40 via-[#B78C22] to-[#D5A52A]"
            />
            <div className="relative flex items-start justify-between">
              {["0", "2", "4", "6", "8"].map((w, i) => (
                <div key={w} className="flex flex-col items-center" style={{ width: 90 }}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.15, duration: 0.4 }}
                    className="h-7 w-7 rounded-full border-4 border-white bg-[#8C6A1A] shadow"
                  />
                  <div className="mt-2 whitespace-nowrap text-[15px] font-medium text-[#1B1D22]/75 tabular-nums">
                    неделя {w}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-5">
            {stages.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
                className="flex h-[260px] flex-col overflow-hidden rounded-2xl border-2 p-5"
                style={{ borderColor: `${s.color}66`, background: `${s.color}0d` }}
              >
                <div className="flex items-center gap-2.5">
                  <s.Icon size={22} strokeWidth={1.8} style={{ color: s.color }} />
                  <Editable
                    id={`${s.id}.weeks`}
                    defaultValue={s.weeks}
                    as="div"
                    className="text-[15px] font-semibold uppercase tracking-[0.18em]"
                    {...{ style: { color: s.color } } as any}
                  />
                </div>
                <Editable
                  id={`${s.id}.title`}
                  defaultValue={s.title}
                  as="div"
                  className="mt-2 text-[22px] font-semibold leading-[1.2] text-[#1B1D22]"
                />
                <Editable
                  id={`${s.id}.text`}
                  defaultValue={s.text}
                  as="div"
                  multiline
                  className="mt-2 flex-1 text-[17px] leading-[1.35] text-[#1B1D22]/80"
                />
                {/* Анимированный прогресс-бар */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${s.progress * 100}%` }}
                    transition={{ delay: 0.6 + i * 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full"
                    style={{ background: s.color }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <Editable
          id="s6.summary"
          as="div"
          multiline
          defaultValue="Итоговый цикл сделки — 6–8 недель до первой оплаты. Конверсия «демо → оплата» ≈ 55%."
          className="mt-5 text-[20px] font-semibold text-[#1B1D22]"
        />
        <div className="mt-2 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s6.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s6.foot.page" defaultValue="07 / 08" />
        </div>
      </div>
    </SlideLayout>
  );
}
