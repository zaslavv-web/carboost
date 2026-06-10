/**
 * Single auth backend.
 *
 * Реэкспорт LaravelAuthContext, чтобы все потребители `useAuth()` продолжали
 * работать без изменений. Внешних сетевых вызовов из этого модуля нет.
 */

import {
  LaravelAuthProvider,
  useLaravelAuth,
} from "@/contexts/LaravelAuthContext";

export const AuthProvider = LaravelAuthProvider;
export const useAuth = useLaravelAuth;
