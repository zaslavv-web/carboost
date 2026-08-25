import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


const TRUSTED_URL_PROTOCOLS = /^(data:|blob:)/i;

function sameOriginUrl(value: string): string | undefined {
  if (!/^https?:\/\//i.test(value)) return undefined;

  try {
    const parsed = new URL(value);
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const apiBase = (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";
    const apiOrigin = apiBase.startsWith("http") ? new URL(apiBase).origin : currentOrigin;

    if (parsed.origin === currentOrigin || parsed.origin === apiOrigin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function resolveUrl(url?: string | null): string | undefined {
  const value = String(url ?? "").trim();
  if (!value) return undefined;
  if (TRUSTED_URL_PROTOCOLS.test(value)) return value;

  const sameOrigin = sameOriginUrl(value);
  if (sameOrigin) return resolveUrl(sameOrigin);
  if (/^https?:\/\//i.test(value)) return undefined;

  const apiBase = (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";
  const appBase = apiBase.replace(/\/api$/, "");
  const withSlash = value.startsWith("/") ? value : `/${value}`;

  if (withSlash.startsWith("/storage/") || withSlash.startsWith("/api/")) return `${appBase}${withSlash}`;
  return withSlash;
}
