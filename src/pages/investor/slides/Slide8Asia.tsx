import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import { Globe2, Headphones, Building2, Users2, Rocket } from "lucide-react";

const countries = [
  {
    id: "s8.ph",
    Icon: Headphones,
    country: "Филиппины",
    step: "Шаг 1 · 2028",
    points: [
      "IT-BPM: $40,3 млрд выручки в 2025 г., 17 % мирового headcount отрасли (2-е место после Индии) — IBPAP",
      "Отрасль планировала до 1,84 млн рабочих мест — непрерывный найм и онбординг тысяч людей",
      "Английский язык интерфейса, высокая текучесть в контакт-центрах — прямой спрос на адаптацию, оценку и удержание",
    ],
  },
  {
    id: "s8.my",
    Icon: Building2,
    country: "Малайзия",
    step: "Шаг 2 · 2028–2029",
    points: [
      "HR-tech внедрён неравномерно: разрыв между корпорациями и SME, за пределами Сингапура проникновение низкое — HRX Consulting, 2025",
      "Значительная часть HR-департаментов работает без полноценных цифровых инструментов — Vase.ai",
      "Хаб для регионального офиса: англоязычная среда, зрелая ИТ-инфраструктура",
    ],
  },
  {
    id: "s8.id",
    Icon: Users2,
    country: "Индонезия",
    step: "Шаг 3 · 2029",
    points: [
      "Крупнейшая рабочая сила Юго-Восточной Азии, молодая демография — масштаб на порядок больше рынка РФ",
      "Подтверждённые разрывы в навыках Industry 4.0 в высокорастущих отраслях — ADB, 2021",
      "Апскиллинг признан ключевым драйвером роста экономик ЮВА — PwC",
    ],
  },
];

const why = [
  {
    id: "s8.w1",
    title: "Низкое проникновение HR-tech",
    text: "Рынок HCM-софта ЮВА только формируется: фрагментированное трудовое законодательство и цифровой разрыв у SME сдерживали внедрение — L.E.K. Consulting, 2024.",
  },
  {
    id: "s8.w2",
    title: "Высокая потребность",
    text: "Массовый найм в BPO и производстве, дефицит цифровых навыков и текучесть требуют именно адаптации, оценки и карьерных треков — то, что мы уже сделали.",
  },
  {
    id: "s8.w3",
    title: "Наше преимущество",
    text: "Мультиязычность и мультитенантность в ядре, ИИ-оценка компетенций, on-premise/локальный хостинг под требования к данным, цена ниже западных вендоров.",
  },
];

const sources = [
  { label: "IBPAP · Industry Overview 2025", url: "https://admin.ibpap.org/storage/hub-resources/7Hv9U2uoLJVx2kxyRMObNm6W6L0MR57l9dZfrez7.pdf" },
  { label: "PhilStar · IT-BPM eyes 1.84M jobs (2024)", url: "https://www.philstar.com/business/2024/01/23/2327724/it-bpm-industry-eyes-184-million-jobs-year" },
  { label: "L.E.K. · HCM Software in SEA (2024)", url: "https://www.lek.com/insights/technology/hcm-software-transforming-hr-southeast-asia" },
  { label: "HRX · HR Technology Adoption in SEA (2025)", url: "https://hrxconsulting.org/wp-content/uploads/2025/02/HR-Technology-Adoption-in-Southeast-Asia_202502.pdf" },
  { label: "Vase.ai · Digitizing HR in Malaysia", url: "https://www.vase.ai/resources/blogs/digitizing-human-resource-malaysia-data" },
  { label: "ADB · Skills Development in SEA (2021)", url: "https://www.adb.org/sites/default/files/publication/671711/industry-skills-development-southeast-asia.pdf" },
  { label: "PwC · Upskilling for shared prosperity in SEA", url: "https://www.pwc.com/gx/en/consulting-services/assets/upskilling-for-shared-prosperity-in-southeast-asia-fostering-sustainable-growth.pdf" },
];

export default function Slide8Asia() {
  return (
    <SlideLayout kicker="Экспансия · Юго-Восточная Азия">
      <div className="flex h-full flex-col px-[80px] pt-[110px] pb-[52px]">
        <div className="flex items-center gap-4">
          <Globe2 size={34} strokeWidth={1.6} className="text-[#8C6A1A]" />
          <Editable
            id="s8.title"
            as="h2"
            defaultValue="Экспансия в Азию: Филиппины, Малайзия, Индонезия"
            className="text-[44px] font-bold leading-[1.05] text-[#1B1D22]"
          />
        </div>
        <Editable
          id="s8.lead"
          as="p"
          defaultValue="Регион с формирующимся рынком HR-tech и огромной рабочей силой: выходим после выхода на прибыль в РФ, англоязычной версией продукта и через локальных партнёров."
          className="mt-2 max-w-[1500px] text-[19px] text-[#1B1D22]/70"
        />

        <div className="mt-5 grid grid-cols-3 gap-4">
          {countries.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl bg-white p-5"
              style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 1px 3px 1px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-[#1B1D22]">
                  <c.Icon size={22} strokeWidth={1.7} className="text-[#8C6A1A]" />
                  <Editable
                    id={`${c.id}.country`}
                    defaultValue={c.country}
                    as="div"
                    className="text-[24px] font-bold"
                  />
                </div>
                <div className="rounded-full bg-[#D5A52A]/15 px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8C6A1A]">
                  {c.step}
                </div>
              </div>
              <ul className="mt-3 space-y-2.5">
                {c.points.map((p, j) => (
                  <li key={j} className="flex gap-2.5 text-[16px] leading-[1.35] text-[#1B1D22]/85">
                    <span className="mt-[9px] inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[#D5A52A]" />
                    <Editable id={`${c.id}.p${j}`} defaultValue={p} multiline />
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {why.map((w) => (
            <div key={w.id} className="rounded-2xl bg-[#D5A52A]/10 p-4">
              <div className="flex items-center gap-2 text-[#8C6A1A]">
                <Rocket size={18} strokeWidth={1.7} />
                <Editable
                  id={`${w.id}.t`}
                  defaultValue={w.title}
                  as="div"
                  className="text-[15px] font-semibold uppercase tracking-[0.12em]"
                />
              </div>
              <Editable
                id={`${w.id}.x`}
                defaultValue={w.text}
                as="p"
                multiline
                className="mt-2 text-[16px] leading-[1.35] text-[#1B1D22]/80"
              />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8C6A1A]">
            Источники
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-[#1B1D22]/65">
            {sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[#D5A52A] decoration-1 underline-offset-2 hover:text-[#8C6A1A]"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[17px] text-[#1B1D22]/60">
          <Editable id="s8.foot.brand" defaultValue="Пик роста · 2026" />
          <Editable id="s8.foot.page" defaultValue="09 / 10" />
        </div>
      </div>
    </SlideLayout>
  );
}
