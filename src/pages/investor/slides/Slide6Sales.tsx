import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { PlayCircle, ClipboardCheck, Rocket, Wallet } from "lucide-react";

const stages = [
  {
    id: "s6.st.1",
    icon: PlayCircle,
    weeks: "2–4 недели",
    title: "Работа с демо",
    text: "Показ продукта, доступ к песочнице, ответы на вопросы, согласование сценария внедрения.",
    color: "#8C6A1A",
    pos: "16%",
  },
  {
    id: "s6.st.2",
    icon: ClipboardCheck,
    weeks: "4–6 недели",
    title: "Подтверждение и подключение",
    text: "Подтверждение заинтересованности, согласование договора, техническая поддержка подключения и настройка.",
    color: "#B78C22",
    pos: "50%",
  },
  {
    id: "s6.st.3",
    icon: Rocket,
    weeks: "6–8 недели",
    title: "Боевой запуск · оплата",
    text: "Миграция данных, обучение администраторов, приёмка, поступление первой оплаты от компании.",
    color: "#D5A52A",
    pos: "84%",
  },
];

const wins = [
  { id: "s6.w.0", text: "Единое окно вместо 5+ инструментов — быстрая отдача" },
  { id: "s6.w.1", text: "Российская разработка, установка в контуре — безопасность и госсектор" },
  { id: "s6.w.2", text: "ИИ подключается к внутренней модели клиента (vLLM / Ollama)" },
  { id: "s6.w.3", text: "Пилот 60 дней с обязательными метриками — снижает риск покупки" },
  { id: "s6.w.4", text: "Прозрачная цена за сотрудника — понятна финансовому директору" },
];

export default function Slide6Sales() {
  return (
    <SlideLayout kicker="Продажи · График получения оплаты">
      <div className="grid h-full grid-cols-12 gap-6 px-14 pt-28 pb-10">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#1B1D22]">
            <Editable id="s6.h1.a" defaultValue="От первого демо " />
            <span className="italic text-[#8C6A1A]"><Editable id="s6.h1.b" defaultValue="до оплаты" /></span>
            <Editable id="s6.h1.c" defaultValue=" — 6–8 недель" />
          </h2>
          <Editable id="s6.lead" as="p" multiline
            defaultValue="Целевой клиент — компании со 100+ сотрудников. Модель — подписка с бесплатным пилотом, средний цикл сделки 6–8 недель до первой оплаты."
            className="mt-2 max-w-[1500px] text-[20px] text-[#1B1D22]/70" />
        </div>

        {/* Таймлайн */}
        <div className="col-span-12 rounded-3xl border border-[#D5A52A]/30 bg-white p-10 shadow-sm">
          <div className="relative">
            {/* линия */}
            <div className="absolute left-0 right-0 top-8 h-2 rounded-full bg-gradient-to-r from-[#8C6A1A]/40 via-[#B78C22] to-[#D5A52A]" />

            {/* деления недель */}
            <div className="relative h-16">
              {["0", "2", "4", "6", "8"].map((w, i) => (
                <div key={w} className="absolute -top-1 flex flex-col items-center" style={{ left: `${i * 25}%`, transform: "translateX(-50%)" }}>
                  <div className="h-6 w-6 rounded-full border-4 border-white bg-[#8C6A1A] shadow" />
                  <div className="mt-2 text-[13px] font-mono text-[#1B1D22]/70">неделя {w}</div>
                </div>
              ))}
            </div>
          </div>

          {/* карточки этапов */}
          <div className="mt-8 grid grid-cols-3 gap-6">
            {stages.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className="rounded-2xl border-2 p-5" style={{ borderColor: `${s.color}66`, background: `${s.color}0d` }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${s.color}26`, color: s.color }}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-widest" style={{ color: s.color }}>
                        <Editable id={`${s.id}.weeks`} defaultValue={s.weeks} />
                      </div>
                      <Editable id={`${s.id}.title`} defaultValue={s.title} as="div"
                        className="text-[22px] font-semibold text-[#1B1D22]" />
                    </div>
                  </div>
                  <Editable id={`${s.id}.text`} defaultValue={s.text} as="div" multiline
                    className="mt-3 text-[15px] leading-[1.45] text-[#1B1D22]/80" />
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-[#D5A52A]/40 bg-[#D5A52A]/10 px-5 py-3">
            <div className="flex items-center gap-3">
              <Wallet className="h-6 w-6 text-[#8C6A1A]" />
              <Editable id="s6.summary" defaultValue="Итоговый цикл сделки — 6–8 недель до первой оплаты от клиента" as="div"
                className="text-[18px] font-semibold text-[#1B1D22]" />
            </div>
            <div className="text-[14px] text-[#1B1D22]/70">
              <Editable id="s6.conv" defaultValue="Конверсия «демо → оплата» ≈ 55%" />
            </div>
          </div>
        </div>

        {/* Почему выигрываем — компактный блок */}
        <div className="col-span-12 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/5 p-5">
          <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">
            <Editable id="s6.wins.title" defaultValue="Почему выигрываем сделки" />
          </div>
          <ul className="mt-3 grid grid-cols-5 gap-4">
            {wins.map((t) => (
              <li key={t.id} className="flex gap-3 text-[14px] leading-[1.4] text-[#1B1D22]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                <Editable id={t.id} defaultValue={t.text} multiline />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideLayout>
  );
}
