import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import DeckNav from "./DeckNav";
import { DeckContentProvider } from "./deck/DeckContentContext";
import Slide1Product from "./slides/Slide1Product";
import Slide2Market from "./slides/Slide2Market";
import Slide3ProductTree from "./slides/Slide3ProductTree";
import Slide4AI from "./slides/Slide4AI";
import Slide5Economics from "./slides/Slide5Economics";
import Slide6Sales from "./slides/Slide6Sales";

const slides = [
  Slide1Product,
  Slide2Market,
  Slide3ProductTree,
  Slide4AI,
  Slide5Economics,
  Slide6Sales,
];
const titles = ["Продукт", "Рынок", "Архитектура", "AI", "Экономика", "Продажи"];

function DeckInner() {
  const [params, setParams] = useSearchParams();
  const raw = parseInt(params.get("slide") ?? "1", 10);
  const index = Math.min(Math.max(raw - 1, 0), slides.length - 1);
  const prevIndex = useRef(index);

  const direction = index > prevIndex.current ? 1 : index < prevIndex.current ? -1 : 0;
  useEffect(() => {
    prevIndex.current = index;
  }, [index]);

  const go = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), slides.length - 1);
      const next = new URLSearchParams(params);
      next.set("slide", String(clamped + 1));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    document.title = `Пик роста · ${index + 1}/${slides.length} — ${titles[index]}`;
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key.toLowerCase() === "f") {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const Current = slides[index];

  const requestFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const variants = reduced
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (d: number) => ({ opacity: 0, x: d >= 0 ? 60 : -60 }),
        center: { opacity: 1, x: 0 },
        exit: (d: number) => ({ opacity: 0, x: d >= 0 ? -60 : 60 }),
      };

  return (
    <div className="min-h-screen bg-[#1B1D22] print:bg-white">
      <div className="print:hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            className="fixed inset-0"
            variants={variants as any}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="hidden print:block">
        {slides.map((S, i) => (
          <div
            key={i}
            style={{
              width: 1920,
              height: 1080,
              pageBreakAfter: "always",
              breakAfter: "page",
              position: "relative",
            }}
          >
            <S />
          </div>
        ))}
      </div>

      <DeckNav
        index={index}
        total={slides.length}
        onPrev={() => go(index - 1)}
        onNext={() => go(index + 1)}
        onFullscreen={requestFs}
      />

      <style>{`
        @media print {
          @page { size: 1920px 1080px landscape; margin: 0 }
          body { background: white }
        }
      `}</style>
    </div>
  );
}

export default function InvestorDeck() {
  return (
    <DeckContentProvider>
      <DeckInner />
    </DeckContentProvider>
  );
}
