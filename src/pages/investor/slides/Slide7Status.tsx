import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { CheckCircle2, Clock } from "lucide-react";

const done = [
  { id: "s7.done.0", text: "Портал компании: мессенджер, новости, таск-трекер" },
  { id: "s7.done.1", text: "Онбординг и адаптация сотрудников" },
  { id: "s7.done.2", text: "Карьерные треки и оценка компетенций" },
  { id: "s7.done.3", text: "Кадровая аналитика: риски, комфорт, выгорание" },
  { id: "s7.done.4", text: "Геймификация: магазин наград, баллы, знаки отличия" },
  { id: "s7.done.5", text: "Оргструктура и цифровой паспорт сотрудника" },
  { id: "s7.done.6", text: "Оценка компетенций через ИИ-интервью" },
  { id: "s7.done.7", text: "Мультитенантность и 5 ролей пользователей" },
  { id: "s7.done.8", text: "Мобильная версия (веб-приложение)" },
];

const todo = [
  { id: "s7.todo.0", text: "Онлайн-университет: полноценный конструктор курсов" },
  { id: "s7.todo.1", text: "Внешние интеграции: 1С:ЗУП, Битрикс24, календари" },
  { id: "s7.todo.2", text: "Расширенная аналитика для совета директоров" },
  { id: "s7.todo.3", text: "Поставка в контуре компании и ИИ на её инфраструктуре" },
  { id: "s7.todo.4", text: "Мобильные приложения для iOS и Android" },
  { id: "s7.todo.5", text: "Магазин сценариев оценки и наград" },
];

export default function Slide7Status() {
  const readiness = Math.round((done.length / (done.length + todo.length)) * 100);

  return (
    <SlideLayout kicker="Статус реализации">
      <div className="grid h-full grid-cols-12 gap-8 px-16 pt-28 pb-12">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#1B1D22]">
            <Editable id="s7.h1.a" defaultValue="Что уже " />
            <span className="italic text-[#8C6A1A]"><Editable id="s7.h1.b" defaultValue="сделано" /></span>
            <Editable id="s7.h1.c" defaultValue=" и что предстоит" />
          </h2>
          <Editable id="s7.lead" as="p" multiline
            defaultValue="Ядро платформы в промышленной эксплуатации. Инвестиции ускоряют оставшиеся направления и выход на масштабирование."
            className="mt-2 max-w-[1500px] text-[20px] text-[#1B1D22]/70" />
        </div>

        {/* Progress */}
        <div className="col-span-12 rounded-2xl border border-[#D5A52A]/40 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-widest text-[#8C6A1A]">Готовность продукта</div>
            <div className="font-['Instrument_Serif'] text-[36px] text-[#1B1D22]">
              ≈ {readiness}%
            </div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[#D5A52A]/15">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8C6A1A] to-[#D5A52A]" style={{ width: `${readiness}%` }} />
          </div>
        </div>

        {/* Сделано */}
        <div className="col-span-6 rounded-2xl border-2 border-[#D5A52A]/50 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-[#8C6A1A]" />
            <Editable id="s7.done.title" defaultValue="Уже реализовано" as="div"
              className="text-[26px] font-semibold text-[#1B1D22]" />
          </div>
          <ul className="mt-4 space-y-3">
            {done.map((r) => (
              <li key={r.id} className="flex gap-3 text-[17px] leading-[1.4] text-[#1B1D22]/85">
                <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                <Editable id={r.id} defaultValue={r.text} multiline />
              </li>
            ))}
          </ul>
        </div>

        {/* Предстоит */}
        <div className="col-span-6 rounded-2xl border-2 border-dashed border-[#8C6A1A]/60 bg-[#D5A52A]/5 p-6">
          <div className="flex items-center gap-3">
            <Clock className="h-7 w-7 text-[#8C6A1A]" />
            <Editable id="s7.todo.title" defaultValue="Предстоит сделать" as="div"
              className="text-[26px] font-semibold text-[#1B1D22]" />
          </div>
          <ul className="mt-4 space-y-3">
            {todo.map((r) => (
              <li key={r.id} className="flex gap-3 text-[17px] leading-[1.4] text-[#1B1D22]/85">
                <span className="mt-2 h-2 w-2 flex-none rounded-full border-2 border-[#8C6A1A]" />
                <Editable id={r.id} defaultValue={r.text} multiline />
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-12 text-[13px] text-[#1B1D22]/60">
          <Editable id="s7.foot" multiline
            defaultValue="Все пункты редактируемые. Готовность рассчитывается автоматически как доля выполненных пунктов от общего списка." />
        </div>
      </div>
    </SlideLayout>
  );
}
