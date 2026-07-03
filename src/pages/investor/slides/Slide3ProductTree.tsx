import SlideLayout from "../SlideLayout";
import { motion } from "framer-motion";

type Module = { name: string; services: string[] };

// 9 модулей — 4 слева, 5 справа (или наоборот) для симметричного дерева
const modules: Module[] = [
  { name: "Адаптация",     services: ["Онбординг", "Планы", "Испыт. срок"] },
  { name: "Карьера",       services: ["Треки", "IDP", "AI-оценка"] },
  { name: "Перфоманс",     services: ["OKR", "1:1", "Ревью 360"] },
  { name: "Обучение",      services: ["LMS", "Тесты", "Сертификаты"] },
  { name: "Tracker",       services: ["Задачи", "Board", "Проекты"] },
  { name: "Аналитика",     services: ["People", "Risk", "HRD Dash"] },
  { name: "Вовлечение",    services: ["Признание", "Магазин", "Pulse"] },
  { name: "Коммуникации",  services: ["Чаты", "Лента", "Сообщества"] },
  { name: "HR-документы",  services: ["Отпуска", "Кадры", "Support"] },
];

// Позиции модулей на «дереве»: половина слева, половина справа
const W = 1888;   // рабочая ширина
const H = 720;    // рабочая высота SVG
const CX = W / 2;
const TRUNK_TOP = 60;
const TRUNK_BOTTOM = H - 40;

// Разложение: чередуем стороны, распределяем по вертикали
const positions = modules.map((m, i) => {
  const side = i % 2 === 0 ? -1 : 1; // -1 = лево, +1 = право
  const row = Math.floor(i / 2);
  const totalRows = Math.ceil(modules.length / 2);
  const y = TRUNK_TOP + 90 + (row * (TRUNK_BOTTOM - TRUNK_TOP - 130)) / (totalRows - 1);
  const x = CX + side * (360 + (row % 2) * 40);
  return { ...m, x, y, side, row };
});

export default function Slide3ProductTree() {
  return (
    <SlideLayout kicker="Архитектура продукта">
      <div className="flex h-full flex-col px-14 pt-28 pb-10">
        <h2 className="font-['Instrument_Serif'] text-[60px] leading-[1.05] text-[#F5F1E8]">
          Дерево <span className="italic text-[#D5A52A]">платформы</span>
        </h2>
        <p className="mt-2 max-w-[1400px] text-[20px] text-[#F5F1E8]/70">
          Ствол — информационный портал. Ветки — 9 модулей. Листья — сервисы и подмодули.
        </p>

        <div className="relative mt-4 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="trunk-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D5A52A" />
                <stop offset="100%" stopColor="#5A4410" />
              </linearGradient>
              <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#D5A52A" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#D5A52A" stopOpacity="0" />
              </radialGradient>
              <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            {/* Trunk */}
            <motion.rect
              x={CX - 14}
              y={TRUNK_TOP}
              width={28}
              height={TRUNK_BOTTOM - TRUNK_TOP}
              rx={14}
              fill="url(#trunk-grad)"
              initial={{ scaleY: 0, originY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{ transformOrigin: `${CX}px ${TRUNK_TOP}px` }}
            />

            {/* Root / portal label */}
            <g>
              <motion.rect
                x={CX - 260} y={TRUNK_TOP - 44}
                width={520} height={70} rx={16}
                fill="#25272D"
                stroke="#D5A52A"
                strokeWidth={1.5}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              />
              <motion.text
                x={CX} y={TRUNK_TOP - 14}
                textAnchor="middle"
                fill="#D5A52A"
                fontSize={12}
                letterSpacing={3}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              >
                УРОВЕНЬ 1 · БАЗА
              </motion.text>
              <motion.text
                x={CX} y={TRUNK_TOP + 10}
                textAnchor="middle"
                fill="#F5F1E8"
                fontSize={22}
                fontFamily="Instrument Serif, serif"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              >
                Информационный портал «Пик роста»
              </motion.text>
            </g>

            {/* Roots at bottom */}
            <motion.path
              d={`M ${CX - 180} ${TRUNK_BOTTOM + 20} Q ${CX - 60} ${TRUNK_BOTTOM - 8} ${CX} ${TRUNK_BOTTOM}
                  Q ${CX + 60} ${TRUNK_BOTTOM - 8} ${CX + 180} ${TRUNK_BOTTOM + 20}`}
              stroke="#8C6A1A" strokeWidth={3} fill="none" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: 0.6 }}
            />

            {/* Branches + module nodes */}
            {positions.map((p, i) => {
              const start = { x: CX, y: p.y };
              const cx1 = CX + p.side * 100;
              const cy1 = p.y - 40;
              const cx2 = p.x - p.side * 120;
              const cy2 = p.y;
              const d = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p.x} ${p.y}`;
              const nodeW = 210;
              const nodeH = 66;
              const nodeX = p.side < 0 ? p.x - nodeW : p.x;
              const anchor = p.side < 0 ? "end" : "start";
              return (
                <g key={p.name}>
                  <motion.path
                    d={d}
                    stroke="#D5A52A"
                    strokeOpacity={0.7}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.7, delay: 0.5 + i * 0.09 }}
                  />
                  {/* glowing node */}
                  <motion.circle
                    cx={p.x} cy={p.y} r={7}
                    fill="#D5A52A"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1.1 + i * 0.09, type: "spring", stiffness: 200 }}
                  />
                  {/* module label */}
                  <motion.g
                    initial={{ opacity: 0, x: p.side * 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 + i * 0.09, duration: 0.4 }}
                  >
                    <text
                      x={p.x + p.side * 18}
                      y={p.y - 6}
                      textAnchor={anchor}
                      fill="#F5F1E8"
                      fontSize={22}
                      fontWeight={600}
                    >
                      {p.name}
                    </text>
                    <text
                      x={p.x + p.side * 18}
                      y={p.y + 18}
                      textAnchor={anchor}
                      fill="#F5F1E8"
                      fontSize={13}
                      opacity={0.65}
                      fontStyle="italic"
                      fontFamily="Instrument Serif, serif"
                    >
                      {p.services.join(" · ")}
                    </text>
                  </motion.g>
                  {/* leaf sub-branches */}
                  {[0, 1, 2].map((k) => {
                    const lx = p.x + p.side * (30 + k * 26);
                    const ly = p.y + 34;
                    return (
                      <motion.line
                        key={k}
                        x1={p.x} y1={p.y + 12}
                        x2={lx} y2={ly}
                        stroke="#D5A52A"
                        strokeOpacity={0.35}
                        strokeWidth={1.2}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, delay: 1.4 + i * 0.09 + k * 0.05 }}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* soft glow around trunk top */}
            <circle cx={CX} cy={TRUNK_TOP + 10} r={90} fill="url(#glow)" />
          </svg>
        </div>

        <div className="mt-2 flex items-center justify-between text-[14px] text-[#F5F1E8]/55">
          <span>Уровни: 1 База → 2 Модули → 3 Сервисы → 4 Подмодули</span>
          <span>16+ модулей · 60+ сервисов · 5 ролей</span>
        </div>
      </div>
    </SlideLayout>
  );
}
