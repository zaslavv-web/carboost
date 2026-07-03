import { useEffect, useState, type ReactNode } from "react";
import brandLogo from "@/assets/logo-growth-peak.png";
import { motion } from "framer-motion";

/**
 * Слайд 1920×1080, вписывается в окно через transform:scale.
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
    <div className="fixed inset-0 overflow-hidden bg-[#1B1D22] print:static print:overflow-visible">
      <div
        className={`absolute left-1/2 top-1/2 origin-center bg-[#1B1D22] text-[#F5F1E8] ${className}`}
        style={{
          width: 1920,
          height: 1080,
          marginLeft: -960,
          marginTop: -540,
          transform: `scale(${scale})`,
        }}
      >
        {kicker && (
          <div className="absolute left-16 top-14 text-[22px] font-medium uppercase tracking-[0.28em] text-[#D5A52A]">
            {kicker}
          </div>
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
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-[#D5A52A]/40"
            />
            <span className="font-['Instrument_Serif'] text-[24px] text-[#F5F1E8]/80">
              Пик роста
            </span>
          </motion.div>
        )}

        {children}
      </div>
    </div>
  );
}
