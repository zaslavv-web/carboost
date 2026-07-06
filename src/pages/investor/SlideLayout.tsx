import { useEffect, useState, type ReactNode } from "react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { motion } from "framer-motion";
import Editable from "./deck/Editable";

/**
 * Слайд 1920×1080, вписывается в окно через transform:scale.
 * Светлая тема.
 */
export default function SlideLayout({
  children,
  kicker,
  className = "",
  hideWatermark = false,
}: {
  children: ReactNode;
  kicker?: string;
  className?: string;
  hideWatermark?: boolean;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calc = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setScale(s);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return (
    <div className="deck-scope fixed inset-0 overflow-hidden bg-[#F7F4EC] print:static print:overflow-visible">
      <div
        className={`absolute left-1/2 top-1/2 origin-center overflow-hidden bg-[#F7F4EC] text-[#1B1D22] ${className}`}
        style={{
          width: 1920,
          height: 1080,
          marginLeft: -960,
          marginTop: -540,
          transform: `scale(${scale})`,
        }}
      >
        {/* Декоративные фоновые орбы */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 0.55, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full"
          style={{ background: "radial-gradient(circle at center, #D5A52A55, transparent 60%)", filter: "blur(40px)" }}
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.45, scale: 1 }}
          transition={{ duration: 1.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute -bottom-60 -left-40 h-[700px] w-[700px] rounded-full"
          style={{ background: "radial-gradient(circle at center, #8C6A1A44, transparent 60%)", filter: "blur(50px)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(213,165,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(213,165,42,0.05) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {kicker && (
          <Editable
            id={`kicker.${kicker}`}
            defaultValue={kicker}
            as="div"
            className="absolute left-16 top-14 text-[22px] font-medium uppercase tracking-[0.28em] text-[#8C6A1A]"
          />
        )}

        {!hideWatermark && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-16 top-12 flex items-center gap-3"
          >
            <img
              src={brandLogo}
              alt="Пик роста"
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-[#D5A52A]/50"
            />
            <span className="font-['Instrument_Serif'] text-[24px] text-[#1B1D22]/80">
              Пик роста
            </span>
          </motion.div>
        )}

        {children}
      </div>
    </div>
  );
}
