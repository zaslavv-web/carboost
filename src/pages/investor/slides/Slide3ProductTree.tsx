import SlideLayout from "../SlideLayout";

type Module = { name: string; services: string[]; sub?: string[] };

const modules: Module[] = [
  {
    name: "Адаптация",
    services: ["Онбординг-сценарии", "Планы адаптации", "Испытательный срок"],
  },
  {
    name: "Карьера",
    services: ["Треки развития", "IDP", "AI-оценка компетенций", "Позиции и матрицы"],
    sub: ["Career Track", "Assessment", "Skills Matrix"],
  },
  {
    name: "Перфоманс",
    services: ["OKR / цели", "1:1", "Ревью 360", "Дисциплина"],
  },
  {
    name: "Обучение",
    services: ["LMS-курсы", "Тесты", "Сертификаты", "База знаний"],
  },
  {
    name: "Tracker",
    services: ["Задачи", "Backlog", "Board", "Проекты", "Workflow"],
  },
  {
    name: "Аналитика",
    services: ["People Analytics", "Product Analytics", "Risk", "HRD Dashboard"],
    sub: ["Retention", "Engagement", "ROI"],
  },
  {
    name: "Вовлечение",
    services: ["Признание", "Геймификация", "Магазин баллов", "Pulse-опросы"],
  },
  {
    name: "Коммуникации",
    services: ["Чаты", "Корп. лента", "Сообщества", "Уведомления"],
  },
  {
    name: "HR-документы",
    services: ["Отпуска", "Кадровые документы", "HR-политики", "Support / тикеты"],
  },
];

export default function Slide3ProductTree() {
  return (
    <SlideLayout kicker="Архитектура продукта">
      <div className="flex h-full flex-col px-16 pt-28 pb-14">
        <h2 className="font-['Instrument_Serif'] text-[64px] leading-none text-[#F5F1E8]">
          Дерево <span className="italic text-[#D5A52A]">платформы</span>
        </h2>
        <p className="mt-2 max-w-[1400px] text-[20px] text-[#F5F1E8]/70">
          Информационный портал в основе, поверх — 9 модулей и десятки сервисов. Всё под единой ролевой моделью и мульти-тенантностью.
        </p>

        {/* Root */}
        <div className="mt-8 flex justify-center">
          <div className="rounded-2xl border border-[#D5A52A] bg-[#D5A52A]/10 px-10 py-5 text-center">
            <div className="text-[13px] uppercase tracking-widest text-[#D5A52A]">Уровень 1 · База</div>
            <div className="mt-1 font-['Instrument_Serif'] text-[36px] text-[#F5F1E8]">
              Информационный портал «Пик роста»
            </div>
            <div className="mt-1 text-[14px] text-[#F5F1E8]/60">
              SSO · Профили · Роли · Мульти-тенант · Уведомления · Брендинг
            </div>
          </div>
        </div>

        {/* Modules grid */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {modules.map((m) => (
            <div key={m.name} className="rounded-xl border border-[#D5A52A]/25 bg-[#25272D] p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-[22px] font-semibold text-[#F5F1E8]">{m.name}</div>
                <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">Модуль</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.services.map((s) => (
                  <span
                    key={s}
                    className="rounded-md bg-[#1B1D22] px-2 py-1 text-[13px] text-[#F5F1E8]/85"
                  >
                    {s}
                  </span>
                ))}
              </div>
              {m.sub && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.sub.map((s) => (
                    <span
                      key={s}
                      className="rounded-md border border-[#D5A52A]/40 px-2 py-0.5 text-[11px] uppercase tracking-wider text-[#D5A52A]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between text-[14px] text-[#F5F1E8]/55">
          <span>Уровни: 1 База → 2 Модули → 3 Сервисы → 4 Подмодули</span>
          <span>16+ модулей · 60+ сервисов · 5 ролей</span>
        </div>
      </div>
    </SlideLayout>
  );
}
