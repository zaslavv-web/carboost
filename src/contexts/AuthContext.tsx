import { laravelDb } from "@/integrations/laravel/db";
/**
 * Phase 13 — single auth backend.
 *
 * Раньше здесь жил Supabase-провайдер. Теперь это просто реэкспорт
 * LaravelAuthContext, чтобы все потребители `useAuth()` продолжали работать
 * без изменений. Никаких сетевых вызовов к *.laravelDb.co из фронтенда больше нет.
 */

import {
  LaravelAuthProvider,
  useLaravelAuth,
} from "@/contexts/LaravelAuthContext";

export const AuthProvider = LaravelAuthProvider;
export const useAuth = useLaravelAuth;
