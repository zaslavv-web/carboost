export type RequestedAppRole = "employee" | "manager" | "hrd";

export const ROLE_OPTIONS: Array<{ value: RequestedAppRole; label: string }> = [
  { value: "employee", label: "Сотрудник" },
  { value: "manager", label: "Руководитель" },
  { value: "hrd", label: "HRD" },
];

export interface PendingSocialSignup {
  companyId: string;
  requestedRole: RequestedAppRole;
  createdAt: number;
}

const PENDING_SOCIAL_SIGNUP_KEY = "pending-social-signup";
const MAX_PENDING_AGE_MS = 1000 * 60 * 30;

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const isRequestedAppRole = (value: string | null | undefined): value is RequestedAppRole => {
  return value === "employee" || value === "manager" || value === "hrd";
};

export const savePendingSocialSignup = (payload: Omit<PendingSocialSignup, "createdAt">) => {
  if (!canUseStorage()) return;

  window.localStorage.setItem(
    PENDING_SOCIAL_SIGNUP_KEY,
    JSON.stringify({
      ...payload,
      createdAt: Date.now(),
    }),
  );
};

export const getPendingSocialSignup = (): PendingSocialSignup | null => {
  if (!canUseStorage()) return null;

  const rawValue = window.localStorage.getItem(PENDING_SOCIAL_SIGNUP_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingSocialSignup>;

    if (!parsed.companyId || !isRequestedAppRole(parsed.requestedRole) || typeof parsed.createdAt !== "number") {
      window.localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
      return null;
    }

    if (Date.now() - parsed.createdAt > MAX_PENDING_AGE_MS) {
      window.localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
      return null;
    }

    return parsed as PendingSocialSignup;
  } catch {
    window.localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
    return null;
  }
};

export const clearPendingSocialSignup = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PENDING_SOCIAL_SIGNUP_KEY);
};