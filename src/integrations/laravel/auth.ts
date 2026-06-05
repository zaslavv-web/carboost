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
    if (redirectTo) url.searchParams.set("return_to", redirectTo);
    window.location.href = url.toString();
  },

  /**
   * Consume the `#access_token=...` returned by GoogleAuthController::callback.
   * Call this from your OAuth landing route once on mount.
   */
  consumeOauthToken(): { ok: boolean; error?: string } {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token") || params.get("access_token") || hash.get("access_token");
    const error = params.get("error") || hash.get("error");

    if (!token && !error) return { ok: false };

    if (token) laravelAuth.setToken(token);

    params.delete("token");
    params.delete("access_token");
    params.delete("error");
    hash.delete("access_token");
    hash.delete("error");
    const qs = params.toString();
    const cleanHash = hash.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : "") + (cleanHash ? `#${cleanHash}` : "");
    window.history.replaceState({}, "", clean);

    if (error) {
      try { console.error("[oauth] backend error:", error); } catch {}
      return { ok: false, error };
    }
    return { ok: true };
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

  /** Phase 13+: admin повторно отправляет письмо восстановления пароля. */
  async adminSendPasswordReset(userId: string) {
    return laravel.post<{ ok: boolean; email: string }>(`/admin/users/${userId}/password-reset`);
  },

  /** Суперадмин назначает/меняет компанию пользователю. */
  async adminAssignCompany(userId: string, companyId: string | null) {
    return laravel.patch<{ ok: boolean; user_id: string; company_id: string | null }>(
      `/admin/users/${userId}/company`,
      { company_id: companyId },
    );
  },

  /**
   * Superadmin impersonation. Issues a backend-scoped token whose Sanctum
   * abilities re-bind `auth()->user()` to the target via EffectiveUser
   * middleware, so subsequent `/auth/me`, `/profiles/me` and policy checks
   * see the impersonated user.
   */
  async startImpersonation(targetUserId: string): Promise<{ token: string; expires_at: string | null }> {
    const res = unwrap(
      await laravel.post<{ token: string; expires_at: string | null }>(
        "/impersonation/start",
        { target_user_id: targetUserId },
      ),
    );
    return res;
  },

  async stopImpersonation(): Promise<void> {
    await laravel.post("/impersonation/stop").catch(() => undefined);
  },
};
