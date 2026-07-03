import { useEffect, useState, type ReactNode } from "react";

/**
 * Слайд 1920×1080, вписывается в окно через transform:scale.
 */
export default function SlideLayout({
  children,
  kicker,
  className = "",
}: {
  children: ReactNode;
  kicker?: string;
  className?: string;
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
        {children}
      </div>
    </div>
  );
}
