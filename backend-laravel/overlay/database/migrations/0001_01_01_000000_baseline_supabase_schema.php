<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BASELINE: фиксирует, что схема уже накатана из дампа Supabase.
 *
 * Эта миграция НИЧЕГО не создаёт. Она лишь проверяет наличие ключевых
 * таблиц (auth.users, public.profiles, public.user_roles, public.companies)
 * и падает с понятной ошибкой, если дамп ещё не импортирован.
 *
 * Запускайте `scripts/import-supabase-dump.sh` ДО `php artisan migrate`.
 *
 * После успешного `migrate` Laravel-таблица `migrations` будет содержать
 * запись о baseline, и все последующие миграции (Sanctum, Spatie, sessions,
 * cache, jobs) будут накатываться поверх.
 */
return new class extends Migration
{
    public function up(): void
    {
        $required = [
            ['schema' => 'auth',   'table' => 'users'],
            ['schema' => 'public', 'table' => 'profiles'],
            ['schema' => 'public', 'table' => 'user_roles'],
            ['schema' => 'public', 'table' => 'companies'],
        ];

        $missing = [];
        foreach ($required as $r) {
            $exists = DB::selectOne(
                'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
                [$r['schema'], $r['table']]
            );
            if (!$exists) {
                $missing[] = "{$r['schema']}.{$r['table']}";
            }
        }

        if (!empty($missing)) {
            throw new \RuntimeException(
                "Baseline миграция не может быть применена: отсутствуют таблицы [" .
                implode(', ', $missing) . "]. Сначала импортируйте дамп Supabase: " .
                "bash scripts/import-supabase-dump.sh /path/to/careertrack.dump"
            );
        }

        // Доп. безопасность: расширения, на которые опирается дамп
        DB::statement('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
        DB::statement('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    }

    public function down(): void
    {
        // baseline не откатывается
    }
};
