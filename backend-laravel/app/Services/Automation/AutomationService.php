<?php

namespace App\Services\Automation;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Центральный сервис автоматизаций продукта:
 *  - авто-зачисление сотрудника на курсы по его должности
 *  - подбор программы лояльности по психо-профилю из анкеты
 *  - триггер начисления наград по событиям (course.completed, track.step.approved, ...)
 *
 * Все методы идемпотентны: повторный вызов не дублирует enrollments/rewards.
 */
class AutomationService
{
    /**
     * Создать enrollments для всех опубликованных курсов, у которых
     * profiles.position_id есть в courses.position_ids.
     */
    public function autoEnrollByPosition(string $userId): int
    {
        $profile = DB::table('profiles')->where('user_id', $userId)->orWhere('id', $userId)->first();
        if (! $profile || empty($profile->position_id) || empty($profile->company_id)) return 0;

        $courses = DB::table('courses')
            ->where('company_id', $profile->company_id)
            ->where('status', 'published')
            ->whereNotNull('position_ids')
            ->get();

        $created = 0;
        foreach ($courses as $c) {
            $positions = $this->jsonArray($c->position_ids);
            if (! in_array($profile->position_id, $positions, true)) continue;

            $exists = DB::table('enrollments')
                ->where('course_id', $c->id)->where('user_id', $userId)->exists();
            if ($exists) continue;

            DB::table('enrollments')->insert([
                'id' => (string) Str::uuid(),
                'course_id' => $c->id,
                'user_id' => $userId,
                'assigned_by' => null,
                'mandatory' => (bool) ($c->mandatory ?? false),
                'status' => 'not_started',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $created++;
        }
        return $created;
    }

    /**
     * По подтверждённой анкете (ai_interpretation.strengths) активируем для сотрудника
     * именно те типы наград, чьи psych_traits пересекаются с его сильными сторонами,
     * выдав «приветственный значок» каждой совпадающей категории.
     */
    public function applyLoyaltyFromQuestionnaire(string $questionnaireId): int
    {
        $q = DB::table('employee_questionnaires')->where('id', $questionnaireId)->first();
        if (! $q || $q->status !== 'confirmed') return 0;
        if (empty($q->user_id) || empty($q->company_id)) return 0;

        $ai = $this->jsonArray($q->ai_interpretation ?? null);
        $strengths = array_map(
            fn ($s) => mb_strtolower((string) (is_array($s) ? ($s['name'] ?? $s['trait'] ?? '') : $s)),
            (array) ($ai['strengths'] ?? [])
        );
        if (! $strengths) return 0;

        $types = DB::table('gamification_reward_types')
            ->where('company_id', $q->company_id)
            ->where('is_active', true)
            ->whereNotNull('psych_traits')
            ->get();

        $issued = 0;
        foreach ($types as $t) {
            $traits = array_map('mb_strtolower', $this->jsonArray($t->psych_traits));
            if (! array_intersect($traits, $strengths)) continue;

            $already = DB::table('employee_rewards')
                ->where('user_id', $q->user_id)
                ->where('reward_type_id', $t->id)
                ->exists();
            if ($already) continue;

            DB::table('employee_rewards')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $q->user_id,
                'company_id' => $q->company_id,
                'reward_type_id' => $t->id,
                'awarded_by' => null,
                'description' => 'Подобрано автоматически по психо-профилю',
                'awarded_at' => now(),
                'created_at' => now(),
            ]);
            $this->creditPoints($q->user_id, $q->company_id, (int) ($t->points ?? 0),
                'reward.psych_match', $t->id, $t->title ?? null);
            $issued++;
        }
        return $issued;
    }

    /**
     * Триггер начисления наград по событию. Перебирает auto-награды компании,
     * чьи trigger_events содержат данное событие, и начисляет валюту/значки.
     */
    public function triggerReward(string $event, string $userId, ?string $companyId = null, array $payload = []): int
    {
        if (! $companyId) {
            $companyId = DB::table('profiles')->where('user_id', $userId)->value('company_id');
        }
        if (! $companyId) return 0;

        $types = DB::table('gamification_reward_types')
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->where('trigger_mode', 'auto')
            ->get();

        $issued = 0;
        foreach ($types as $t) {
            $events = $this->jsonArray($t->trigger_events ?? null);
            if (! in_array($event, $events, true)) continue;

            // Идемпотентность по reference из payload (например, course_id или submission_id)
            $reference = $payload['reference_id'] ?? null;
            if ($reference) {
                $dup = DB::table('currency_transactions')
                    ->where('user_id', $userId)
                    ->where('reference_id', $reference)
                    ->where('description', 'like', $event . '%')
                    ->exists();
                if ($dup) continue;
            }

            DB::table('employee_rewards')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'company_id' => $companyId,
                'reward_type_id' => $t->id,
                'awarded_by' => null,
                'description' => $payload['description'] ?? ('Авто-награда: ' . $event),
                'awarded_at' => now(),
                'created_at' => now(),
            ]);
            $this->creditPoints($userId, $companyId, (int) ($t->points ?? 0), $event, $reference, $t->title ?? null);
            $issued++;
        }
        return $issued;
    }

    /** Начислить валюту: создать транзакцию и обновить баланс. */
    protected function creditPoints(string $userId, string $companyId, int $amount, string $event, ?string $referenceId, ?string $title): void
    {
        if ($amount <= 0) return;
        try {
            DB::table('currency_transactions')->insert([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'company_id' => $companyId,
                'kind' => 'earn',
                'amount' => $amount,
                'reference_id' => $referenceId,
                'description' => $event . ($title ? ': ' . $title : ''),
                'created_at' => now(),
            ]);
            $balance = DB::table('currency_balances')->where('user_id', $userId)->where('company_id', $companyId)->first();
            if ($balance) {
                DB::table('currency_balances')->where('id', $balance->id)->update([
                    'balance' => ((int) $balance->balance) + $amount,
                    'updated_at' => now(),
                ]);
            } else {
                DB::table('currency_balances')->insert([
                    'id' => (string) Str::uuid(),
                    'user_id' => $userId,
                    'company_id' => $companyId,
                    'balance' => $amount,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('creditPoints failed', ['err' => $e->getMessage()]);
        }
    }

    protected function jsonArray($value): array
    {
        if (is_array($value)) return $value;
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }
}
