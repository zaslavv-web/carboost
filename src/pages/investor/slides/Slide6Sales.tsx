import SlideLayout from "../SlideLayout";
import { Target, Megaphone, Handshake, Rocket, Users, Layers } from "lucide-react";

const channels = [
  {
    icon: Target,
    title: "Outbound Enterprise",
    weight: "35% pipeline",
    text: "Прямые продажи HRD / CHRO / CIO среднего и крупного бизнеса. Cold-email + LinkedIn Sales Nav, work-shops для HR-комитетов, ABM по 300 целевым компаниям.",
  },
  {
    icon: Megaphone,
    title: "Inbound · SEO и контент",
    weight: "20% pipeline",
    text: "База знаний по HR-tech, кейсы клиентов, калькуляторы (стоимость текучки, ROI обучения). Ведёт трафик в демо-запросы.",
  },
  {
    icon: Handshake,
    title: "Партнёрская сеть",
    weight: "20% pipeline",
    text: "Rev-share 15–20% с HR-консультантами, интеграторами 1С:ЗУП и Битрикс24, EdTech-провайдерами. White-label для крупных HR-агентств.",
  },
  {
    icon: Rocket,
    title: "Pilot-first sales",
    weight: "15% pipeline",
    text: "Бесплатный PoC 60 дней с фиксированным onboarding-планом и метриками успеха. Средний conversion pilot → paid — 55%.",
  },
  {
    icon: Users,
    title: "HR-конференции",
    weight: "10% pipeline",
    text: "HR EXPO, HR Digital, HR API, T&D Forum. Спикерство, стенд, спонсорство круглых столов HRD-клубов.",
  },
];

const gtmStages = [
  { q: "Q1", focus: "Warm-up",   detail: "20 пилотов из личной сети основателей, 2 показательных кейса" },
  { q: "Q2", focus: "Playbook",  detail: "Оформленный sales-playbook, скрипты, ICP, ставим SDR-процесс" },
  { q: "Q3", focus: "Scale",     detail: "Первые 4 платящих клиента, партнёрка + inbound начинают приносить leads" },
  { q: "Q4", focus: "Repeat",    detail: "Enterprise-контракты, unit-экономика подтверждена, готовим Series-A" },
];

export default function Slide6Sales() {
  return (
    <SlideLayout kicker="Go-to-market · Стратегия продаж">
      <div className="grid h-full grid-cols-12 gap-6 px-14 pt-28 pb-10">
        <div className="col-span-12">
          <h2 className="font-['Instrument_Serif'] text-[58px] leading-[1.05] text-[#F5F1E8]">
            Как мы <span className="italic text-[#D5A52A]">продаём</span> первым 30 клиентам
          </h2>
          <p className="mt-2 max-w-[1400px] text-[20px] text-[#F5F1E8]/70">
            Целевой ICP — компании 200+ сотрудников с активным HRD и бюджетом на цифровизацию.
            Модель — B2B SaaS с бесплатным PoC, средний цикл сделки 45–90 дней.
          </p>
        </div>

        {/* 5 channels */}
        <div className="col-span-12 grid grid-cols-5 gap-4">
          {channels.map(({ icon: Icon, title, weight, text }) => (
            <div key={title} className="rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D5A52A]/15 text-[#D5A52A]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-3 text-[18px] font-semibold text-[#F5F1E8]">{title}</div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-[#D5A52A]">{weight}</div>
              <div className="mt-2 text-[14px] leading-[1.4] text-[#F5F1E8]/70">{text}</div>
            </div>
          ))}
        </div>

        {/* GTM timeline */}
        <div className="col-span-8 rounded-2xl border border-[#D5A52A]/25 bg-[#25272D] p-5">
          <div className="flex items-center gap-2 text-[20px] font-semibold text-[#F5F1E8]">
            <Layers className="h-5 w-5 text-[#D5A52A]" />
            Дорожная карта продаж · 12 мес
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {gtmStages.map((s, i) => (
              <div key={s.q} className="relative rounded-xl border border-[#D5A52A]/25 bg-[#1B1D22] p-3">
                <div className="absolute -top-3 left-3 rounded-md bg-[#D5A52A] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-[#1B1D22]">
                  {s.q}
                </div>
                <div className="mt-2 text-[18px] font-semibold text-[#F5F1E8]">{s.focus}</div>
                <div className="mt-1 text-[13px] leading-[1.35] text-[#F5F1E8]/70">{s.detail}</div>
                {i < gtmStages.length - 1 && (
                  <div className="absolute right-[-14px] top-1/2 hidden h-0.5 w-6 -translate-y-1/2 bg-[#D5A52A]/40 md:block" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
            {[
              { k: "Средний цикл сделки", v: "45–90 дней" },
              { k: "Conversion PoC → paid", v: "≈ 55%" },
              { k: "Sales-команда на Y1", v: "1 Sales Lead + 1 SDR со 2-го полугодия" },
            ].map((r) => (
              <div key={r.k} className="rounded-lg border border-[#D5A52A]/20 bg-[#1B1D22] p-3">
                <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">{r.k}</div>
                <div className="mt-1 text-[18px] text-[#F5F1E8]">{r.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Why we win */}
        <div className="col-span-4 rounded-2xl border border-[#D5A52A]/40 bg-[#D5A52A]/5 p-5">
          <div className="text-[11px] uppercase tracking-widest text-[#D5A52A]">Почему выигрываем сделки</div>
          <ul className="mt-3 space-y-3">
            {[
              "Единое окно вместо 5+ инструментов — быстрая ROI-история",
              "Российская разработка, on-premise → безопасность и госсектор",
              "AI-модуль подключается к внутреннему LLM клиента (vLLM / Ollama)",
              "PoC 60 дней с обязательными метриками — снижает риск покупки",
              "Ценообразование per-seat, прозрачное и предсказуемое для CFO",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-[14px] leading-[1.4] text-[#F5F1E8]/85">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#D5A52A]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideLayout>
  );
}
