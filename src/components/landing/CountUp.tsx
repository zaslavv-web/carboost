import { useEffect, useState } from "react";
import { useInView } from "@/hooks/useInView";

interface Props {
  to: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const CountUp = ({ to, duration = 1400, suffix = "", prefix = "", className }: Props) => {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(easeOut(p) * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val}
      {suffix}
    </span>
  );
};

export default CountUp;
