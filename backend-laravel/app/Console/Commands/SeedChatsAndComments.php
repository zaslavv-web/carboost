<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Заливает демо-переписки в существующую компанию:
 *   - 40 direct-диалогов + 10 групповых чатов (~1500 сообщений)
 *   - 30% задач трекера получают 1-3 комментария
 *
 * Идемпотентно: --reset удаляет всё, что засеяно этой меткой.
 * Реальные диалоги/комментарии компании не трогаются.
 */
class SeedChatsAndComments extends Command
{
    protected $signature = 'chats:seed
        {--owner-email= : Email действующего company_admin/hrd компании}
        {--company-id= : Альтернатива: явный UUID компании}
        {--dm-count=40 : Количество 1:1 диалогов}
        {--group-count=10 : Количество групповых чатов}
        {--msg-per-conv=30 : Среднее число сообщений на диалог (±10)}
        {--task-comments-ratio=30 : Процент задач с комментариями}
        {--task-comments-max=3 : Верхняя граница комментов на задачу}
        {--task-marker=tracker150 : Метка, по которой ищем задачи для комментариев}
        {--marker=chats150 : Метка для идемпотентности}
        {--reset : Удалить всё засеянное этой меткой перед заливкой}
        {--dry-run : Ничего не пишет, только показывает план}';

    protected $description = 'Заливает демо-чаты между сотрудниками и комментарии к задачам трекера.';

    private string $companyId;
    private ?string $ownerUserId = null;
    private string $marker;

    public function handle(): int
    {
        $this->marker = (string) $this->option('marker');
        $dmCount      = max(0, (int) $this->option('dm-count'));
        $groupCount   = max(0, (int) $this->option('group-count'));
        $msgPerConv   = max(1, (int) $this->option('msg-per-conv'));
        $tcRatio      = max(0, min(100, (int) $this->option('task-comments-ratio')));
        $tcMax        = max(1, (int) $this->option('task-comments-max'));
        $dryRun       = (bool) $this->option('dry-run');

        [$this->companyId, $this->ownerUserId] = $this->resolveCompanyId();
        if ($this->companyId === '' || $this->ownerUserId === null) {
            $this->error('Не удалось найти компанию/владельца. Укажи --owner-email или --company-id.');
            return self::FAILURE;
        }
        $companyName = (string) DB::table('companies')->where('id', $this->companyId)->value('name');
        $this->info("Компания: {$companyName} ({$this->companyId})");

        // Пул пользователей компании
        $users = DB::table('profiles')
            ->where('company_id', $this->companyId)
            ->get(['user_id', 'full_name', 'department'])
            ->map(fn ($r) => ['id' => (string) $r->user_id, 'name' => (string) $r->full_name, 'department' => (string) $r->department])
            ->all();
        if (count($users) < 2) {
            $this->error('В компании слишком мало пользователей.');
            return self::FAILURE;
        }
        $this->line('Пул: users=' . count($users));
        $this->line("План: {$dmCount} DM + {$groupCount} групп × ~{$msgPerConv} сообщ., комменты к ~{$tcRatio}% задач");

        if ($this->option('reset')) {
            if ($dryRun) $this->warn("[dry-run] удалил бы засеянное с меткой '{$this->marker}'");
            else $this->resetSeed();
        }

        if ($dryRun) {
            $this->info('[dry-run] изменения не применяются.');
            return self::SUCCESS;
        }

        $convCount = 0; $msgCount = 0; $commentCount = 0;
        DB::transaction(function () use ($users, $dmCount, $groupCount, $msgPerConv, $tcRatio, $tcMax, &$convCount, &$msgCount, &$commentCount) {
            $this->info('1/3  Direct-диалоги…');
            [$dm, $mCount1] = $this->createDirectConversations($users, $dmCount, $msgPerConv);
            $convCount += $dm; $msgCount += $mCount1;

            $this->info('2/3  Групповые чаты…');
            [$gr, $mCount2] = $this->createGroupConversations($users, $groupCount, $msgPerConv);
            $convCount += $gr; $msgCount += $mCount2;

            $this->info('3/3  Комментарии к задачам…');
            $commentCount = $this->createTaskComments($users, $tcRatio, $tcMax);
        });

        $this->info('✅ Готово.');
        $this->line("Диалоги: {$convCount}, сообщения: {$msgCount}, комментарии: {$commentCount}");
        return self::SUCCESS;
    }

    // ───────────────────────────────────────────────────

    private function resolveCompanyId(): array
    {
        $direct = (string) $this->option('company-id');
        if ($direct !== '') {
            if (!DB::table('companies')->where('id', $direct)->exists()) return ['', null];
            $ownerId = DB::table('user_roles')
                ->join('profiles', 'profiles.user_id', '=', 'user_roles.user_id')
                ->where('profiles.company_id', $direct)
                ->whereIn('user_roles.role', ['company_admin', 'hrd'])
                ->value('user_roles.user_id');
            if (!$ownerId) $ownerId = DB::table('profiles')->where('company_id', $direct)->value('user_id');
            return [$direct, $ownerId ? (string) $ownerId : null];
        }
        $email = strtolower((string) $this->option('owner-email'));
        if ($email === '') return ['', null];
        $userId = DB::table('users')->where('email', $email)->value('id');
        if (!$userId) return ['', null];
        $cid = DB::table('profiles')->where('user_id', (string) $userId)->value('company_id');
        return $cid ? [(string) $cid, (string) $userId] : ['', null];
    }

    private function resetSeed(): void
    {
        $needle = '[' . $this->marker . ']';

        // 1) сообщения с меткой + их диалоги
        $msgRows = DB::table('chat_messages')
            ->where('body', 'like', "%{$needle}%")
            ->get(['id', 'conversation_id']);
        $msgIds  = $msgRows->pluck('id')->map('strval')->all();
        $convIds = $msgRows->pluck('conversation_id')->map('strval')->unique()->values()->all();

        // Плюс диалоги с меткой в title
        $convByTitle = DB::table('chat_conversations')
            ->where('company_id', $this->companyId)
            ->where('title', 'like', "%{$needle}%")
            ->pluck('id')->map('strval')->all();
        $convIds = array_values(array_unique(array_merge($convIds, $convByTitle)));

        if ($msgIds) DB::table('chat_message_reactions')->whereIn('message_id', $msgIds)->delete();
        if ($convIds) {
            DB::table('chat_messages')->whereIn('conversation_id', $convIds)->delete();
            DB::table('chat_participants')->whereIn('conversation_id', $convIds)->delete();
            DB::table('chat_conversations')->whereIn('id', $convIds)->delete();
        }

        // 2) комментарии к задачам
        $delComments = DB::table('tracker_comments')
            ->where('company_id', $this->companyId)
            ->where('body', 'like', "{$needle}%")
            ->delete();

        $this->warn("  reset: conversations=" . count($convIds) . ", messages=" . count($msgIds) . ", comments={$delComments}");
    }

    private function createDirectConversations(array $users, int $count, int $msgPerConv): array
    {
        $created = 0; $msgTotal = 0;
        $seenPairs = [];
        for ($i = 0; $i < $count; $i++) {
            $a = $users[array_rand($users)];
            $b = $users[array_rand($users)];
            $tries = 0;
            while (($a['id'] === $b['id'] || isset($seenPairs[$this->pairKey($a['id'], $b['id'])])) && $tries < 20) {
                $b = $users[array_rand($users)];
                $tries++;
            }
            if ($a['id'] === $b['id']) continue;
            $seenPairs[$this->pairKey($a['id'], $b['id'])] = true;

            $convId = (string) Str::uuid();
            $participants = [$a, $b];
            $this->insertConversation($convId, 'direct', null, $a['id']);
            $this->insertParticipants($convId, $participants);
            $count1 = $this->insertMessages($convId, $participants, max(1, $msgPerConv + mt_rand(-10, 10)), true);
            $msgTotal += $count1;
            $created++;
        }
        return [$created, $msgTotal];
    }

    private function createGroupConversations(array $users, int $count, int $msgPerConv): array
    {
        // Собираем департаменты
        $byDept = [];
        foreach ($users as $u) {
            $d = trim((string) $u['department']);
            if ($d === '') continue;
            $byDept[$d][] = $u;
        }
        $depts = array_keys($byDept);
        shuffle($depts);

        $created = 0; $msgTotal = 0;
        for ($i = 0; $i < $count; $i++) {
            $dept = $depts[$i % max(1, count($depts))] ?? null;
            $pool = $dept ? $byDept[$dept] : $users;
            if (count($pool) < 2) $pool = $users;

            $size = min(count($pool), mt_rand(6, 12));
            shuffle($pool);
            $participants = array_slice($pool, 0, $size);

            $title = $dept ? "Отдел «{$dept}» [{$this->marker}]" : "Рабочая группа " . ($i + 1) . " [{$this->marker}]";
            $convId = (string) Str::uuid();
            $creatorId = $participants[0]['id'];
            $this->insertConversation($convId, 'group', $title, $creatorId);
            $this->insertParticipants($convId, $participants, $creatorId);
            $count1 = $this->insertMessages($convId, $participants, max(1, $msgPerConv + mt_rand(-10, 10)), false);
            $msgTotal += $count1;
            $created++;
        }
        return [$created, $msgTotal];
    }

    private function insertConversation(string $id, string $type, ?string $title, string $createdBy): void
    {
        DB::table('chat_conversations')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'type' => $type,
            'title' => $title,
            'created_by' => $createdBy,
            'last_message_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function insertParticipants(string $convId, array $participants, ?string $adminId = null): void
    {
        $rows = [];
        foreach ($participants as $p) {
            $rows[] = [
                'id' => (string) Str::uuid(),
                'conversation_id' => $convId,
                'user_id' => $p['id'],
                'role' => ($adminId && $p['id'] === $adminId) ? 'admin' : 'member',
                'joined_at' => now()->subDays(30),
                'last_read_at' => null,
                'muted_until' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        DB::table('chat_participants')->insert($rows);
    }

    private function insertMessages(string $convId, array $participants, int $count, bool $markerNeeded): int
    {
        $phrases = $this->messagePool();
        $emojis  = ['👍', '🔥', '❤️', '😄', '🙌', '✅'];
        $now = Carbon::now();
        $start = $now->copy()->subDays(30);
        $step = max(1, (int) (($now->timestamp - $start->timestamp) / max(1, $count)));

        $rows = [];
        $ids = [];
        $lastCreated = null;
        for ($i = 0; $i < $count; $i++) {
            $sender = $participants[array_rand($participants)];
            $body = $phrases[array_rand($phrases)];
            if (mt_rand(1, 100) <= 15) $body .= ' ' . $emojis[array_rand($emojis)];
            if ($markerNeeded && $i === 0) {
                $body = "[{$this->marker}] " . $body;
            }
            $ts = $start->copy()->addSeconds($step * $i + mt_rand(0, max(1, $step - 1)));
            $mid = (string) Str::uuid();
            $ids[] = $mid;
            $rows[] = [
                'id' => $mid,
                'conversation_id' => $convId,
                'sender_id' => $sender['id'],
                'body' => $body,
                'reply_to_id' => null,
                'edited_at' => null,
                'deleted_at' => null,
                'created_at' => $ts,
                'updated_at' => $ts,
            ];
            $lastCreated = $ts;
        }
        // батч-вставка
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('chat_messages')->insert($chunk);
        }
        // обновить last_message_at
        DB::table('chat_conversations')->where('id', $convId)->update([
            'last_message_at' => $lastCreated,
            'updated_at' => $lastCreated,
        ]);

        // реакции на ~10% сообщений
        $reactRows = [];
        $reactEmoji = ['👍', '🔥', '❤️', '😄'];
        foreach ($ids as $mid) {
            if (mt_rand(1, 100) > 10) continue;
            $reactorCount = mt_rand(1, 2);
            shuffle($participants);
            foreach (array_slice($participants, 0, $reactorCount) as $p) {
                $reactRows[] = [
                    'id' => (string) Str::uuid(),
                    'message_id' => $mid,
                    'user_id' => $p['id'],
                    'emoji' => $reactEmoji[array_rand($reactEmoji)],
                    'created_at' => now(),
                ];
            }
        }
        if ($reactRows) {
            foreach (array_chunk($reactRows, 200) as $chunk) {
                DB::table('chat_message_reactions')->insertOrIgnore($chunk);
            }
        }

        // 20% участников — last_read_at чуть раньше последнего сообщения
        foreach ($participants as $p) {
            if (mt_rand(1, 100) > 20) continue;
            DB::table('chat_participants')
                ->where('conversation_id', $convId)
                ->where('user_id', $p['id'])
                ->update(['last_read_at' => $lastCreated?->copy()->subMinutes(mt_rand(5, 300))]);
        }

        return count($rows);
    }

    private function createTaskComments(array $users, int $ratio, int $maxPer): int
    {
        $taskMarker = '[' . (string) $this->option('task-marker') . ']';
        $tasks = DB::table('tracker_tasks')
            ->where('company_id', $this->companyId)
            ->where('description', 'like', "%{$taskMarker}%")
            ->get(['id', 'author_id', 'assignee_id', 'created_at']);

        if ($tasks->isEmpty()) {
            $this->warn('  задач с меткой ' . $taskMarker . ' не найдено — комментарии пропущены.');
            return 0;
        }

        $userById = [];
        foreach ($users as $u) $userById[$u['id']] = $u;

        $phrases = [
            'Начал работу.', 'Уточнил у клиента, ждём фидбек.', 'Заблокировано зависимостью от смежного отдела.',
            'Готово к ревью.', 'Смёржил, катим на стейдж.', 'Переношу в следующий спринт — не хватает данных.',
            'Согласовал с руководителем.', 'Требуется дополнительная информация от аналитика.',
            'Проверил метрики — всё сходится.', 'Обновил документацию по итогам работы.',
            'Отправил на согласование юристам.', 'Собрал обратную связь от команды.',
            'Перенёс дедлайн на неделю — согласовано.', 'Договорились созвониться завтра в 14:00.',
            'В процессе, обновлю статус к концу дня.', 'Финализировал текст, ждём подтверждение.',
        ];

        $now = Carbon::now();
        $batch = [];
        $created = 0;

        foreach ($tasks as $task) {
            if (mt_rand(1, 100) > $ratio) continue;
            $count = mt_rand(1, $maxPer);
            $taskCreated = Carbon::parse((string) $task->created_at);
            $totalSpan = max(60, $now->timestamp - $taskCreated->timestamp);
            $prevTs = $taskCreated->copy();

            $candidates = array_filter([$task->author_id, $task->assignee_id], fn ($v) => $v !== null);
            if (empty($candidates)) $candidates = [$this->ownerUserId];

            for ($k = 0; $k < $count; $k++) {
                $authorId = (string) $candidates[array_rand($candidates)];
                $body = "[{$this->marker}] " . $phrases[array_rand($phrases)];

                // 20% — с упоминанием
                $mentions = null;
                if (mt_rand(1, 100) <= 20) {
                    $mUser = $users[array_rand($users)];
                    if ($mUser['id'] !== $authorId) {
                        $body .= ' @' . explode(' ', $mUser['name'])[0];
                        $mentions = json_encode([['user_id' => $mUser['id'], 'name' => $mUser['name']]], JSON_UNESCAPED_UNICODE);
                    }
                }

                $delta = (int) ($totalSpan / max(1, $count));
                $ts = $prevTs->copy()->addSeconds($delta + mt_rand(0, max(1, $delta)));
                if ($ts->gt($now)) $ts = $now->copy()->subMinutes(mt_rand(1, 60));
                $prevTs = $ts;

                $row = [
                    'id' => (string) Str::uuid(),
                    'company_id' => $this->companyId,
                    'task_id' => (string) $task->id,
                    'author_id' => $authorId,
                    'body' => $body,
                    'created_at' => $ts,
                    'updated_at' => $ts,
                ];
                if (Schema::hasColumn('tracker_comments', 'mentions')) {
                    $row['mentions'] = $mentions;
                }
                $batch[] = $row;
                $created++;

                if (count($batch) >= 200) {
                    DB::table('tracker_comments')->insert($batch);
                    $batch = [];
                }
            }
        }
        if ($batch) DB::table('tracker_comments')->insert($batch);
        return $created;
    }

    private function pairKey(string $a, string $b): string
    {
        return $a < $b ? "{$a}|{$b}" : "{$b}|{$a}";
    }

    private function messagePool(): array
    {
        return [
            'Привет! Есть 5 минут?', 'Посмотрел презентацию, отличная работа.',
            'Скинь регламент, пожалуйста.', 'Готово, коммитнул в мастер.',
            'Спасибо!', 'Давай созвонимся после обеда.',
            'Уточни, пожалуйста, дедлайн.', 'Ок, принял.',
            'Есть вопрос по последнему релизу.', 'Согласовал с руководителем.',
            'Отправляю на ревью.', 'Проверь, всё ли в порядке.',
            'Заходил в CRM, всё обновил.', 'Нужна твоя помощь по клиенту.',
            'Отчёт готов, кинул в облако.', 'Договорились, встречаемся в 15:00.',
            'Кажется, есть баг в проде, гляньте.', 'Прекрасный день для запуска :)',
            'Давайте синхронизируемся в четверг.', 'Обновил статус в задаче.',
            'Проверил метрики — всё ок.', 'Отправил инвойс.',
            'Клиент подписал договор!', 'Отлично, поздравляю команду!',
            'Есть предложение по улучшению процесса.', 'Обсудим на 1:1?',
            'Собрал команду в переговорке.', 'Мне понадобятся исходники.',
            'Пришлю чуть позже.', 'Всё, я в отпуск :)',
            'Приветствую, коллеги!', 'Всех с пятницей!',
            'Есть новости по проекту?', 'Заканчиваю, скоро освобожусь.',
            'Дай знать, когда будет готово.', 'Согласовано, двигаемся дальше.',
        ];
    }
}
