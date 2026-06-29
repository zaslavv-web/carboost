import { useEffect, useRef, useState } from "react";

/**
 * Returns [ref, inView] — flips once the element enters viewport.
 * `once: true` keeps it true after first entry (default).
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: IntersectionObserverInit & { once?: boolean } = {}
): [React.RefObject<T>, boolean] {
  const { once = true, root, rootMargin = "0px 0px -10% 0px", threshold = 0.15 } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { root, rootMargin, threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, root, rootMargin, threshold]);

  return [ref, inView];
}
