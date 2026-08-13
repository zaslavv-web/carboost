<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\EmailConfigService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Пошаговый замер памяти.
 *
 * В логе видно, что даже тривиальные запросы (`/api/chats/unread-count`,
 * анонимный `/api/analytics/ingest`) упираются в 250+ МБ. Значит память
 * съедается не «тяжёлым SQL», а чем-то на общем пути запроса. Команда
 * измеряет каждый этап отдельно и печатает дельту, чтобы виновник был виден
 * цифрой, а не гипотезой.
 *
 * Запуск на сервере:
 *   php artisan diag:memory --email=user@example.com
 */
class DiagnoseMemory extends Command
{
    protected $signature = 'diag:memory {--email= : email пользователя для замера пути авторизации}';
    protected $description = 'Пошаговый замер расхода памяти на типовом пути запроса';

    private float $last = 0;

    public function handle(): int
    {
        $this->last = memory_get_usage(true) / 1048576;
        $this->line(sprintf('memory_limit=%s', ini_get('memory_limit')));
        $this->stage('после загрузки фреймворка');

        try {
            DB::select('select 1');
        } catch (\Throwable $e) {
            $this->error('DB недоступна: ' . $e->getMessage());
        }
        $this->stage('после подключения к БД');

        try {
            app(EmailConfigService::class)->apply();
        } catch (\Throwable $e) {
            $this->warn('EmailConfigService: ' . $e->getMessage());
        }
        $this->stage('после EmailConfigService::apply()');

        try {
            app(\Spatie\Permission\PermissionRegistrar::class)->getPermissions();
            $this->stage('после загрузки прав Spatie');
        } catch (\Throwable $e) {
            $this->warn('Spatie: ' . $e->getMessage());
        }

        $email = (string) $this->option('email');
        if ($email !== '') {
            $user = User::where('email', $email)->first();
            if (!$user) {
                $this->error("Пользователь {$email} не найден");
                return self::FAILURE;
            }
            $this->stage('после загрузки пользователя');

            $roles = $user->domainRoles();
            $this->stage('после чтения user_roles (' . implode(',', $roles) . ')');

            $companyId = $user->companyId();
            $this->stage('после чтения profiles.company_id (' . ($companyId ?? 'null') . ')');

            auth()->setUser($user);
            $userId = $user->domainUserId();
            $count = DB::table('chat_messages as m')
                ->join('chat_participants as p', function ($join) use ($userId) {
                    $join->on('p.conversation_id', '=', 'm.conversation_id')
                        ->where('p.user_id', '=', $userId);
                })
                ->whereNull('m.deleted_at')
                ->where('m.sender_id', '!=', $userId)
                ->count();
            $this->stage("после запроса unread-count (найдено {$count})");
        }

        $this->line(sprintf('ПИК: %.1f МБ', memory_get_peak_usage(true) / 1048576));
        return self::SUCCESS;
    }

    private function stage(string $label): void
    {
        $now = memory_get_usage(true) / 1048576;
        $this->line(sprintf('%7.1f МБ (+%5.1f) — %s', $now, $now - $this->last, $label));
        $this->last = $now;
    }
}
