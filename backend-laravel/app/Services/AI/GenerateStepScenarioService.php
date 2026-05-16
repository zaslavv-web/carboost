<?php

namespace App\Services\AI;

/** Replaces edge function: generate-step-scenario */
class GenerateStepScenarioService
{
    public function __construct(protected AiGatewayService $ai)
    {
    }

    public function generate(array $payload): array
    {
        $title = $payload['step_title'] ?? ('Этап ' . (($payload['step_order'] ?? 0) + 1));
        $goals = $payload['goals'] ?? [];
        $generateTest = (bool) ($payload['generate_test'] ?? false);

        $fallback = [
            'instructions' => "Для подтверждения этапа \"{$title}\" пройдите контрольный тест (≥80%), загрузите минимум 1 файл и комментарий.",
            'reinforced_instructions' => "Усиленный сценарий повторного прохождения этапа \"{$title}\": тест ≥85%, минимум 2 файла, развёрнутое описание изменений.",
            'questions' => $generateTest ? $this->fallbackTest($goals) : [],
        ];

        $sys = 'Ты HR-эксперт. Сгенерируй на русском: (1) инструкции по подтверждению этапа; (2) усиленные инструкции для повторного прохождения; '
            . ($generateTest ? '(3) 5 закрытых вопросов с 4 вариантами и одним верным (correct — индекс 0..3).' : '');

        $user = "Этап: {$title}\nЦели: " . implode('; ', $goals ?: ['—'])
            . "\nУсловия: " . implode('; ', $payload['pass_conditions'] ?? ['—'])
            . "\nМетрики: " . implode('; ', $payload['success_metrics'] ?? ['—']);

        try {
            $args = $this->ai->chatToolCall(
                messages: [
                    ['role' => 'system', 'content' => $sys],
                    ['role' => 'user', 'content' => $user],
                ],
                toolName: 'build_scenario',
                parameters: [
                    'type' => 'object',
                    'properties' => [
                        'instructions' => ['type' => 'string'],
                        'reinforced_instructions' => ['type' => 'string'],
                        'questions' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'id' => ['type' => 'string'],
                                    'question' => ['type' => 'string'],
                                    'options' => ['type' => 'array', 'items' => ['type' => 'string']],
                                    'correct' => ['type' => 'number'],
                                    'competency' => ['type' => 'string'],
                                ],
                                'required' => ['id', 'question', 'options', 'correct'],
                            ],
                        ],
                    ],
                    'required' => ['instructions', 'reinforced_instructions'],
                ],
            );
        } catch (AiGatewayException) {
            return $fallback + ['source' => 'fallback'];
        }

        return [
            'instructions' => $args['instructions'] ?? $fallback['instructions'],
            'reinforced_instructions' => $args['reinforced_instructions'] ?? $fallback['reinforced_instructions'],
            'questions' => $generateTest ? ($args['questions'] ?? $fallback['questions']) : [],
            'source' => 'ai',
        ];
    }

    private function fallbackTest(array $goals): array
    {
        $base = $goals ?: ['Базовые компетенции этапа'];
        return collect($base)->take(5)->values()->map(fn ($g, $i) => [
            'id' => 'q' . ($i + 1),
            'question' => "Какое утверждение лучше всего описывает цель: «{$g}»?",
            'options' => [
                'Выполнено в полном объёме согласно регламенту',
                'Выполнено частично без подтверждения',
                'Не выполнено',
                'Не относится к этапу',
            ],
            'correct' => 0,
            'competency' => 'Этап трека',
        ])->all();
    }
}
