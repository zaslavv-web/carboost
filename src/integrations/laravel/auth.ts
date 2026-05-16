/**
 * Laravel Sanctum auth helpers (Phase 9).
 *
 * Wraps the AuthController + GoogleAuthController endpoints registered in
 * `backend-laravel/overlay/routes/api.php` and stores the bearer token via
 * `laravelAuth.setToken` so that every subsequent `aiInvoke` / `laravel.*`
 * call carries it automatically.
 */

import { laravel, laravelAuth, type LaravelInvokeResult } from "./client";

export interface LaravelUser {
  id: string;
  email: string;
  full_name?: string | null;
  is_verified?: boolean;
  company_id?: string | null;
  roles?: string[];
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LaravelLoginResponse {
  token: string;
  user: LaravelUser;
}

function unwrap<T>({ data, error }: LaravelInvokeResult<T>): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("Пустой ответ сервера");
  return data;
}

export const laravelAuthApi = {
  async login(email: string, password: string): Promise<LaravelUser> {
    const res = unwrap(await laravel.post<LaravelLoginResponse>("/auth/login", { email, password }));
    laravelAuth.setToken(res.token);
    return res.user;
  },

  async register(payload: {
    email: string;
    password: string;
    full_name: string;
    company_id?: string | null;
    requested_role?: string | null;
  }): Promise<LaravelUser> {
    const res = unwrap(await laravel.post<LaravelLoginResponse>("/auth/register", payload));
    if (res.token) laravelAuth.setToken(res.token);
    return res.user;
  },

  async me(): Promise<LaravelUser | null> {
    if (!laravelAuth.getToken()) return null;
    const { data, error } = await laravel.get<LaravelUser>("/auth/me");
    if (error) {
      if (error.status === 401) {
        laravelAuth.setToken(null);
        return null;
      }
      throw new Error(error.message);
    }
    return data;
  },

  async logout(): Promise<void> {
    if (laravelAuth.getToken()) {
      await laravel.post("/auth/logout").catch(() => undefined);
    }
    laravelAuth.setToken(null);
  },

  /** Redirects the browser to the Laravel-hosted Google OAuth endpoint. */
  signInWithGoogle(redirectTo?: string) {
    const base =
      (import.meta.env.VITE_LARAVEL_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api";
    const url = new URL(`${base}/auth/google/redirect`, window.location.origin);
    if (redirectTo) url.searchParams.set("redirect", redirectTo);
    window.location.href = url.toString();
  },

  /**
   * Consume the `?token=...` returned by GoogleAuthController::callback.
   * Call this from your OAuth landing route once on mount.
   */
  consumeOauthToken(): boolean {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return false;
    laravelAuth.setToken(token);
    params.delete("token");
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState({}, "", clean);
    return true;
  },

  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<void> {
    unwrap(await laravel.post("/auth/forgot-password", { email, redirectTo }));
  },

  async updatePassword(payload: { token: string; email: string; password: string }): Promise<void> {
    unwrap(await laravel.post("/auth/reset-password", payload));
  },

  /** Phase 13: admin creates user (replaces admin-create-user edge function). */
  async adminCreateUser(payload: {
    full_name: string;
    email: string;
    role: "employee" | "manager" | "hrd" | "company_admin";
    company_id?: string | null;
  }) {
    return laravel.post<{ user: LaravelUser }>("/admin/users", payload);
  },
};
