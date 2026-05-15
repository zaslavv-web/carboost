/**
 * Drop-in replacement for `supabase.rpc(name, params)` (Phase 10).
 *
 * Returns the same `{ data, error }` shape so call sites can switch by
 * changing only the import.
 */

import { laravel, type LaravelInvokeResult } from "./client";

export function laravelRpc<T = any>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<LaravelInvokeResult<T>> {
  return laravel.post<T>(`/rpc/${name}`, { params });
}
