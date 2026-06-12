/**
 * Lightweight color helpers used by the company branding system.
 * We work in HSL because the design system tokens in `index.css` are HSL triples
 * (e.g. `--primary: 46 65% 52%`).
 */

export type Hsl = { h: number; s: number; l: number };

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Parse "#rrggbb" / "#rgb" / "rgb(...)" to {r,g,b} in 0..255. */
export function parseColor(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const s = input.trim();
  const hex = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R: h = (G - B) / d + (G < B ? 6 : 0); break;
      case G: h = (B - R) / d + 2; break;
      default: h = (R - G) / d + 4;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const S = s / 100, L = l / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const Hp = h / 60;
  const X = C * (1 - Math.abs((Hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (Hp >= 0 && Hp < 1) [r1, g1, b1] = [C, X, 0];
  else if (Hp < 2) [r1, g1, b1] = [X, C, 0];
  else if (Hp < 3) [r1, g1, b1] = [0, C, X];
  else if (Hp < 4) [r1, g1, b1] = [0, X, C];
  else if (Hp < 5) [r1, g1, b1] = [X, 0, C];
  else [r1, g1, b1] = [C, 0, X];
  const m = L - C / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseColor(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

export function hslToHex({ h, s, l }: Hsl): string {
  const { r, g, b } = hslToRgb({ h, s, l });
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Format as a CSS variable triple `"H S% L%"`. */
export function hslToVar({ h, s, l }: Hsl): string {
  return `${h} ${s}% ${l}%`;
}

/** Parse a stored variable triple back to {h,s,l}. */
export function varToHsl(value: string | null | undefined): Hsl | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%$/);
  if (!m) return null;
  return { h: +m[1], s: +m[2], l: +m[3] };
}

export function lighten(hsl: Hsl, by: number): Hsl {
  return { ...hsl, l: clamp(hsl.l + by) };
}
export function darken(hsl: Hsl, by: number): Hsl {
  return { ...hsl, l: clamp(hsl.l - by) };
}

/**
 * Return either "0 0% 100%" (white) or "220 11% 12%" (charcoal) as a foreground
 * that is readable on top of the given color. Uses relative luminance.
 */
export function getReadableForegroundVar(hsl: Hsl): string {
  const { r, g, b } = hslToRgb(hsl);
  const toLin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return L > 0.5 ? "220 11% 12%" : "0 0% 100%";
}

/**
 * Naive dominant color extraction from an image URL via canvas.
 * Samples pixels on a downscaled 64x64 thumbnail, ignores transparent and
 * near-white/near-black pixels, then averages.
 */
export async function extractDominantColor(src: string): Promise<Hsl | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 64;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
            if (A < 200) continue;
            const max = Math.max(R, G, B), min = Math.min(R, G, B);
            if (max > 240 && min > 230) continue; // near white
            if (max < 25) continue;               // near black
            if (max - min < 12) continue;         // near grey
            r += R; g += G; b += B; count++;
          }
          if (count < 5) {
            // fallback: simple average of all opaque pixels
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] < 200) continue;
              r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
            }
          }
          if (count === 0) return resolve(null);
          resolve(rgbToHsl(r / count, g / count, b / count));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}
