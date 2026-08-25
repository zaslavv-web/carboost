import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


export function resolveUrl(url?: string | null): string | undefined {
  const value = String(url ?? "").trim();
  if (!value) return undefined;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const apiBase = (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";
  const appBase = apiBase.replace(/\/api$/, "");
  const withSlash = value.startsWith("/") ? value : `/${value}`;

  if (withSlash.startsWith("/storage/") || withSlash.startsWith("/api/")) return `${appBase}${withSlash}`;
  return withSlash;
}
