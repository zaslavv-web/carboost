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
    protected $signature = 'chat:diagnose {user_id} {--conversations=50}';
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

    public function handle(): int
    {
        $userId = (string) $this->argument('user_id');
        $limit  = (int) $this->option('conversations');

        $this->info("memory_limit = " . ini_get('memory_limit'));
        $this->info("user_id = {$userId}");

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
