<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Диагностика памяти для GET /api/chats.
 *
 *   php artisan chat:diagnose <user_id>
 *
 * Команда повторяет выборки ChatController::buildIndex() по шагам и печатает
 * количество строк и пик памяти после каждого шага. Нужна, чтобы точно
 * определить, какой набор данных раздувается на боевом сервере, а не гадать.
 */
class ChatDiagnose extends Command
{
    protected $signature = 'chat:diagnose {user? : id или email пользователя} {--conversations=50} {--top=10 : показать самых «тяжёлых» участников чатов}';
    protected $description = 'Показать объёмы данных и пик памяти для списка чатов конкретного пользователя';

    private function mem(string $step): void
    {
        $this->line(sprintf(
            '  [memory] %-28s current=%.1fMB peak=%.1fMB',
            $step,
            memory_get_usage(true) / 1048576,
            memory_get_peak_usage(true) / 1048576
        ));
    }

    /** Принимает и uuid, и email. Возвращает null, если пользователь не найден. */
    private function resolveUserId(?string $input): ?string
    {
        if (! $input) {
            return null;
        }

        if (str_contains($input, '@')) {
            return DB::table('users')->where('email', $input)->value('id');
        }

        return DB::table('users')->where('id', $input)->value('id');
    }

    /** Кто в системе состоит в наибольшем числе диалогов — кандидаты на падение. */
    private function showTopUsers(int $limit): void
    {
        $rows = DB::table('chat_participants as p')
            ->leftJoin('users as u', 'u.id', '=', 'p.user_id')
            ->groupBy('p.user_id', 'u.email')
            ->selectRaw('p.user_id, u.email, COUNT(*) AS conversations')
            ->orderByDesc('conversations')
            ->limit($limit)
            ->get();

        $this->info('Топ пользователей по числу диалогов:');
        foreach ($rows as $row) {
            $this->line(sprintf('  %-40s %-35s %d диалогов', $row->user_id, $row->email ?? '—', $row->conversations));
        }
        $this->newLine();
        $this->line('Запустите: php -d memory_limit=512M artisan chat:diagnose <id или email>');
    }

    public function handle(): int
    {
        $limit = (int) $this->option('conversations');
        $this->info("memory_limit = " . ini_get('memory_limit'));

        $userId = $this->resolveUserId($this->argument('user'));
        if (! $userId) {
            if ($this->argument('user')) {
                $this->error('Пользователь не найден: ' . $this->argument('user'));
            }
            $this->showTopUsers((int) $this->option('top'));
            return self::SUCCESS;
        }

        $userId = (string) $userId;
        $email = DB::table('users')->where('id', $userId)->value('email');
        $this->info("user_id = {$userId} ({$email})");

        $isSuper = DB::table('user_roles')->where('user_id', $userId)->where('role', 'superadmin')->exists();
        $companyId = DB::table('profiles')->where('user_id', $userId)->value('company_id');
        $this->line("  superadmin = " . ($isSuper ? 'yes' : 'no') . ", company_id = " . ($companyId ?: '—'));


        $conversations = DB::table('chat_conversations as c')
            ->join('chat_participants as own', function ($join) use ($userId) {
                $join->on('own.conversation_id', '=', 'c.id')
                    ->where('own.user_id', '=', $userId);
            })
            ->when(!$isSuper, function ($query) use ($companyId) {
                if ($companyId === null || $companyId === '') {
                    $query->whereRaw('1 = 0');
                    return;
                }
                $query->where('c.company_id', $companyId);
            })
            ->orderByDesc('last_message_at')
            ->limit($limit)
            ->get(['c.id', 'c.type']);

        $this->info('conversations: ' . $conversations->count());
        $this->mem('conversations');

        if ($conversations->isEmpty()) {
            $this->warn('Диалогов нет — endpoint отдаёт пустой список.');
            return self::SUCCESS;
        }

        $ids = $conversations->pluck('id')->all();

        $participantRows = (int) DB::table('chat_participants')->whereIn('conversation_id', $ids)->count();
        $participantPairs = (int) DB::table('chat_participants')
            ->whereIn('conversation_id', $ids)
            ->distinct()
            ->count(DB::raw('CONCAT(conversation_id, "|", user_id)'));

        $this->info("chat_participants rows: {$participantRows}, уникальных пар: {$participantPairs}, дублей: " . ($participantRows - $participantPairs));
        $this->mem('participants count');

        $top = DB::table('chat_participants')
            ->whereIn('conversation_id', $ids)
            ->groupBy('conversation_id')
            ->selectRaw('conversation_id, COUNT(*) AS n')
            ->orderByDesc('n')
            ->limit(5)
            ->get();
        foreach ($top as $row) {
            $this->line("  топ диалог {$row->conversation_id}: {$row->n} участников");
        }

        $msgStats = DB::table('chat_messages')
            ->whereIn('conversation_id', $ids)
            ->whereNull('deleted_at')
            ->selectRaw('COUNT(*) AS n, MAX(CHAR_LENGTH(body)) AS max_len, SUM(CHAR_LENGTH(body)) AS total_len')
            ->first();
        $this->info(sprintf(
            'chat_messages: %d шт, max body = %d симв, всего = %.1fMB',
            (int) ($msgStats->n ?? 0),
            (int) ($msgStats->max_len ?? 0),
            ((int) ($msgStats->total_len ?? 0)) / 1048576
        ));
        $this->mem('messages stats');

        $uniqueUsers = (int) DB::table('chat_participants')
            ->whereIn('conversation_id', $ids)
            ->distinct()
            ->count('user_id');
        $this->info("уникальных user_id для профилей: {$uniqueUsers}");
        $this->mem('profiles count');

        $this->newLine();
        $this->info('Готово. Ищите строку с аномальным количеством строк — это и есть источник расхода памяти.');

        return self::SUCCESS;
    }
}
