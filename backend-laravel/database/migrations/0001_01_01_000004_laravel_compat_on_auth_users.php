<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Делает таблицу auth.users (созданную Supabase) пригодной для Eloquent + Sanctum
 * БЕЗ изменения существующих данных и колонок Supabase.
 *
 * Что добавляем:
 * - remember_token VARCHAR(100) NULL — нужен Laravel-аутентификации
 * - VIEW public.users — проксирует auth.users, чтобы Sanctum/Eloquent
 *   могли работать со стандартным `users` table, не трогая схему auth.
 *   Запросы к view маршрутизируются через INSTEAD OF триггеры на UPDATE
 *   только тех колонок, которые мы реально меняем (remember_token, email,
 *   encrypted_password). Сложные операции с auth.users всё равно делаются
 *   напрямую в SQL.
 *
 * Маппинг колонок (Supabase → Laravel):
 *   id                         → id (uuid, primary)
 *   email                      → email
 *   encrypted_password         → password (read-only через VIEW)
 *   raw_user_meta_data         → meta
 *   email_confirmed_at         → email_verified_at
 *   created_at, updated_at     → created_at, updated_at
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. remember_token в auth.users (если ещё нет)
        DB::statement(<<<'SQL'
            DO $$ BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='auth' AND table_name='users' AND column_name='remember_token'
              ) THEN
                ALTER TABLE auth.users ADD COLUMN remember_token VARCHAR(100) NULL;
              END IF;
            END $$;
        SQL);

        // 2. VIEW public.users поверх auth.users
        DB::statement(<<<'SQL'
            CREATE OR REPLACE VIEW public.users AS
            SELECT
              id,
              email,
              encrypted_password   AS password,
              email_confirmed_at   AS email_verified_at,
              raw_user_meta_data   AS meta,
              remember_token,
              created_at,
              updated_at
            FROM auth.users;
        SQL);

        // 3. INSTEAD OF триггер — пишем обратно в auth.users только разрешённые поля
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.users_view_update() RETURNS trigger AS $fn$
            BEGIN
              UPDATE auth.users SET
                email              = COALESCE(NEW.email, email),
                encrypted_password = COALESCE(NEW.password, encrypted_password),
                email_confirmed_at = COALESCE(NEW.email_verified_at, email_confirmed_at),
                raw_user_meta_data = COALESCE(NEW.meta, raw_user_meta_data),
                remember_token     = NEW.remember_token,
                updated_at         = now()
              WHERE id = OLD.id;
              RETURN NEW;
            END;
            $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
        SQL);

        DB::statement('DROP TRIGGER IF EXISTS users_view_update_trg ON public.users');
        DB::statement(<<<'SQL'
            CREATE TRIGGER users_view_update_trg
            INSTEAD OF UPDATE ON public.users
            FOR EACH ROW EXECUTE FUNCTION public.users_view_update();
        SQL);

        // 4. Полезный индекс для поиска по email (если ещё нет)
        DB::statement('CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users (lower(email))');
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS users_view_update_trg ON public.users');
        DB::statement('DROP FUNCTION IF EXISTS public.users_view_update()');
        DB::statement('DROP VIEW IF EXISTS public.users');
        // remember_token и индекс намеренно не удаляем
    }
};
