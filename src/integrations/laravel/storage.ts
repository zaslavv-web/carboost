/**
 * Drop-in subset of `supabase.storage.from(bucket).*` (Phase 11).
 *
 * Backed by the Laravel `/api/storage/{bucket}/*` bridge. Covers the methods
 * the project uses: upload, createSignedUrl, getPublicUrl, remove.
 */

import { laravel, laravelAuth, type LaravelInvokeResult } from "./client";

const BASE_URL =
  (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";

class BucketClient {
  constructor(private readonly bucket: string) {}

  async upload(
    path: string,
    file: Blob | File,
    options: { upsert?: boolean; contentType?: string } = {},
  ): Promise<LaravelInvokeResult<{ path: string; fullPath: string; url: string | null }>> {
    const fd = new FormData();
    fd.append("file", file);
    if (path) fd.append("path", path);
    if (options.upsert) fd.append("upsert", "1");

    const headers: Record<string, string> = { Accept: "application/json" };
    const token = laravelAuth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${BASE_URL}/storage/${this.bucket}/upload`, {
        method: "POST", headers, body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { data: null, error: { message: body?.error || res.statusText, status: res.status } };
      }
      return { data: body?.data ?? null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || "Network error" } };
    }
  }

  async createSignedUrl(
    path: string,
    ttlSeconds = 600,
  ): Promise<LaravelInvokeResult<{ signedUrl: string }>> {
    const qs = new URLSearchParams({ path, ttl: String(ttlSeconds) }).toString();
    const res = await laravel.get<{ data: { signedUrl: string } }>(
      `/storage/${this.bucket}/sign?${qs}`,
    );
    return res.error ? { data: null, error: res.error } : { data: res.data?.data ?? null, error: null };
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: `${BASE_URL.replace(/\/api$/, "")}/storage/${this.bucket}/${path}` } };
  }

  async remove(paths: string[]): Promise<LaravelInvokeResult<{ deleted: number }>> {
    // DELETE with JSON body — done via fetch directly (laravel.delete has no body arg).
    const token = laravelAuth.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json", Accept: "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const r = await fetch(`${BASE_URL}/storage/${this.bucket}`, {
        method: "DELETE", headers, body: JSON.stringify({ paths }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return { data: null, error: { message: body?.error || r.statusText, status: r.status } };
      return { data: body?.data ?? null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || "Network error" } };
    }
  }
}

export const laravelStorage = {
  from(bucket: string) {
    return new BucketClient(bucket);
  },
};
