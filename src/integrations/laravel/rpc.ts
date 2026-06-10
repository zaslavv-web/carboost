/**
 * RPC client backed by the Laravel `/api/rpc/{name}` bridge.
 * Returns `{ data, error }`.
 */

import { laravel, type LaravelInvokeResult } from "./client";

export function laravelRpc<T = any>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<LaravelInvokeResult<T>> {
  return laravel.post<T>(`/rpc/${name}`, { params });
}
