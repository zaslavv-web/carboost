<?php

namespace App\Services\AI;

/** Replaces edge function: generate-default-track-steps */
class GenerateDefaultTrackStepsService
{
    public function __construct(protected AiGatewayService $ai)
    {
    }

    public function generate(int $months, ?string $positionTitle = null, array $goals = []): array
    {
        $months = max(1, min(60, $months));
        $sys = 'Ты HR-эксперт. Сформируй структуру карьерного трека на ' . $months .
            ' месяцев. Каждый этап: order, title, description, duration_months, goals, pass_conditions, rewards, penalty, success_metrics. Сумма duration_months ≈ заданным месяцам.';
        $user = 'Должность: ' . ($positionTitle ?: '—') . "\nЦели трека: " . implode('; ', $goals ?: ['общий профессиональный рост']);

        try {
            $args = $this->ai->chatToolCall(
                [
                    ['role' => 'system', 'content' => $sys],
                    ['role' => 'user', 'content' => $user],
                ],
                'build_track_steps',
                [
                    'type' => 'object',
                    'properties' => [
                        'steps' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'order' => ['type' => 'number'],
                                    'title' => ['type' => 'string'],
                                    'description' => ['type' => 'string'],
                                    'duration_months' => ['type' => 'number'],
                                    'goals' => ['type' => 'array', 'items' => ['type' => 'string']],
                                    'pass_conditions' => ['type' => 'array', 'items' => ['type' => 'string']],
                                    'rewards' => ['type' => 'array', 'items' => ['type' => 'string']],
                                    'penalty' => ['type' => 'string'],
                                    'success_metrics' => ['type' => 'array', 'items' => ['type' => 'string']],
                                ],
                                'required' => ['order', 'title', 'duration_months'],
                            ],
                        ],
                    ],
                    'required' => ['steps'],
                ],
            );
        } catch (AiGatewayException) {
            return ['steps' => $this->fallback($months), 'source' => 'fallback'];
        }

        $steps = $args['steps'] ?? [];
        if (! $steps) {
            return ['steps' => $this->fallback($months), 'source' => 'fallback'];
        }
        return ['steps' => $steps, 'source' => 'ai'];
    }

    private function fallback(int $months): array
    {
        $count = max(2, min(6, (int) ceil($months / 3)));
        $per = (int) round($months / $count);
        return collect(range(0, $count - 1))->map(fn ($i) => [
            'order' => $i,
            'title' => 'Этап ' . ($i + 1),
            'description' => 'Базовый этап карьерного трека',
            'duration_months' => $per,
            'goals' => ['Освоить ключевые навыки этапа'],
            'pass_conditions' => ['Подтверждение руководителя', 'Тест ≥80%'],
            'rewards' => ['Признание', 'Бонус к рейтингу'],
            'penalty' => 'Повторное прохождение этапа',
            'success_metrics' => ['Выполнение KPI'],
        ])->all();
    }
}
