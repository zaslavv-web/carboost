import SlideLayout from "../SlideLayout";
import Editable from "../deck/Editable";
import { motion } from "framer-motion";
import { GraduationCap, Users, Trophy, LineChart } from "lucide-react";

const branches = [
  {
    id: "b1",
    icon: GraduationCap,
    name: "Онлайн-университет",
    leaves: [
      "Онбординг новых сотрудников",
      "Профильное обучение",
      "Обучение новым продуктам компании",
      "Обязательные курсы и аттестации",
    ],
  },
  {
    id: "b2",
    icon: Users,
    name: "Кадровый резерв",
    leaves: [
      "Карьерные треки",
      "Оценка эффективности (перформанс-ревью)",
      "Рейтинг сотрудника (риски и отставания)",
      "План индивидуального развития",
    ],
  },
  {
    id: "b3",
    icon: Trophy,
    name: "Геймификация",
    leaves: [
      "Награды за достижения",
      "Сценарии наград",
      "Магазин наград",
      "Рейтинги и знаки отличия",
    ],
  },
  {
    id: "b4",
    icon: LineChart,
    name: "Кадровая аналитика",
    leaves: [
      "Риски по сотрудникам",
      "Текучесть кадров",
      "Индекс комфорта и вовлечённости",
      "Прогноз выгорания",
    ],
  },
];

export default function Slide3ProductTree() {
  return (
    <SlideLayout kicker="Архитектура продукта">
      <div className="flex h-full flex-col px-14 pt-28 pb-10">
        <h2 className="font-['Instrument_Serif'] text-[60px] leading-[1.05] text-[#1B1D22]">
          <Editable id="s3.title.a" defaultValue="Дерево " />
          <span className="italic text-[#8C6A1A]"><Editable id="s3.title.b" defaultValue="платформы" /></span>
        </h2>
        <Editable id="s3.subtitle" as="p" multiline
          defaultValue="Основание — портал компании. Ветки — четыре направления. Листья — сервисы и подмодули."
          className="mt-2 max-w-[1500px] text-[20px] text-[#1B1D22]/70" />

        {/* Root / основа */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mt-8 w-[1100px] rounded-3xl border-2 border-[#D5A52A] bg-[#D5A52A]/10 px-10 py-6 text-center shadow-md"
        >
          <div className="text-[13px] uppercase tracking-widest text-[#8C6A1A]">
            <Editable id="s3.root.kicker" defaultValue="Основа · портал компании" />
          </div>
          <div className="mt-2 font-['Instrument_Serif'] text-[36px] text-[#1B1D22]">
            <Editable id="s3.root.title" defaultValue="Портал компании «Пик роста»" />
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[18px] text-[#1B1D22]/75">
            <Editable id="s3.root.item.0" defaultValue="Мессенджеры" />
            <span className="text-[#8C6A1A]">·</span>
            <Editable id="s3.root.item.1" defaultValue="Новости компании" />
            <span className="text-[#8C6A1A]">·</span>
            <Editable id="s3.root.item.2" defaultValue="Таск-трекер" />
          </div>
        </motion.div>

        {/* Branches */}
        <div className="mt-8 grid flex-1 grid-cols-4 gap-6">
          {branches.map((br, i) => {
            const Icon = br.icon;
            return (
              <motion.div
                key={br.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
                className="relative flex flex-col rounded-2xl border border-[#D5A52A]/40 bg-white p-6 shadow-sm"
              >
                {/* Connector to root */}
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: "top" }}
                  className="absolute -top-6 left-1/2 h-6 w-0.5 -translate-x-1/2 bg-[#D5A52A]/60"
                />

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D5A52A]/20 text-[#8C6A1A]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <Editable id={`s3.${br.id}.name`} defaultValue={br.name} as="div"
                    className="text-[22px] font-semibold text-[#1B1D22]" />
                </div>

                <ul className="mt-4 space-y-3">
                  {br.leaves.map((leaf, j) => (
                    <li key={j} className="flex gap-3 text-[16px] leading-[1.35] text-[#1B1D22]/80">
                      <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#D5A52A]" />
                      <Editable id={`s3.${br.id}.leaf.${j}`} defaultValue={leaf} multiline />
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-[13px] text-[#1B1D22]/60">
          <Editable id="s3.foot.a" defaultValue="Уровни: основание → направления → сервисы → подмодули" />
          <Editable id="s3.foot.b" defaultValue="4 направления · 16+ сервисов · 5 ролей пользователей" />
        </div>
      </div>
    </SlideLayout>
  );
}
