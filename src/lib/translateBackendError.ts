import i18n from "@/i18n";

/** Shape of a Supabase / PostgREST error (subset we care about). */
interface BackendError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

const t = (key: string) => i18n.t(key, { ns: "errors" });

/**
 * Maps a Supabase / Postgres / network error to a localized string
 * from the "errors" i18n namespace.
 *
 * Pass either a raw Error, a PostgrestError-shaped object, or a plain string.
 */
export function translateBackendError(
  err: BackendError | Error | string | null | undefined,
): string {
  if (!err) return t("generic.unknown");

  const msg =
    typeof err === "string"
      ? err
      : (err as BackendError).message ?? String(err);

  const code =
    typeof err === "object" && !(err instanceof Error)
      ? (err as BackendError).code
      : undefined;

  // ── Auth errors ────────────────────────────────────────────────────────────
  if (/invalid login credentials/i.test(msg))
    return t("auth.invalidCredentials");
  if (/email not confirmed/i.test(msg)) return t("auth.emailNotConfirmed");
  if (/user not found/i.test(msg)) return t("auth.userNotFound");
  if (/user already registered/i.test(msg)) return t("auth.emailExists");
  if (
    /password should be at least/i.test(msg) ||
    /signup requires a valid password/i.test(msg)
  )
    return t("auth.weakPassword");
  if (/unable to validate email address/i.test(msg))
    return t("validation.invalidFormat");
  if (
    /for security purposes, you can only request this after/i.test(msg) ||
    /email rate limit exceeded/i.test(msg)
  )
    return t("auth.rateLimit");
  if (/jwt/i.test(msg) || code === "PGRST301") return t("auth.sessionExpired");

  // ── RLS / permission errors ───────────────────────────────────────────────
  if (
    /row.level security/i.test(msg) ||
    /rls/i.test(msg) ||
    /permission denied/i.test(msg) ||
    code === "42501"
  )
    return t("rls.permissionDenied");

  // ── Network errors ────────────────────────────────────────────────────────
  if (
    /failed to fetch/i.test(msg) ||
    /network/i.test(msg) ||
    /fetch/i.test(msg)
  )
    return t("network.fetchFailed");

  // ── Validation errors ─────────────────────────────────────────────────────
  if (/required/i.test(msg)) return t("validation.requiredField");
  if (/invalid format/i.test(msg)) return t("validation.invalidFormat");

  // ── Generic fallback ──────────────────────────────────────────────────────
  return t("generic.unknown");
}
