import { useEffect, useState } from "react";

export type Orientation = "portrait" | "landscape";

export function useOrientation(): Orientation {
  const get = (): Orientation =>
    typeof window === "undefined"
      ? "portrait"
      : window.matchMedia("(orientation: landscape)").matches
        ? "landscape"
        : "portrait";

  const [orientation, setOrientation] = useState<Orientation>(get);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(orientation: landscape)");
    const onChange = () => setOrientation(mql.matches ? "landscape" : "portrait");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return orientation;
}
