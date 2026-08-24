/**
 * Детерминированная заглушка изображения товара.
 * Пока у товара нет своей картинки, показываем фирменный градиент
 * с инициалами названия — стабильный для одного и того же title.
 */

const PALETTE: Array<[string, string]> = [
  ["#1B1D22", "#D5A52A"],
  ["#22252C", "#C08A3E"],
  ["#1E2430", "#E0B84B"],
  ["#26201A", "#D5A52A"],
  ["#1A2422", "#B9974A"],
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function productInitials(title: string): string {
  const words = (title || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function productPlaceholder(title: string): string {
  const [bg, accent] = PALETTE[hash(title || "product") % PALETTE.length];
  const initials = productInitials(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="200" r="120" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="200" y="200" text-anchor="middle" dominant-baseline="central"
    font-family="Georgia, 'Instrument Serif', serif" font-size="110" fill="${accent}">${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Итоговый src картинки товара: своя картинка либо заглушка. */
export function productImageSrc(imageUrl: string | null | undefined, title: string): string {
  return imageUrl && imageUrl.trim() ? imageUrl : productPlaceholder(title);
}
