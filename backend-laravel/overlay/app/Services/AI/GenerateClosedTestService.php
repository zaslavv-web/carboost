<?php

namespace App\Services\AI;

/** Replaces edge function: generate-closed-test */
class GenerateClosedTestService
{
    private const SYSTEM = <<<'TXT'
Ты — эксперт по корпоративной оценке. Сгенерируй тест из 12 закрытых вопросов с одним правильным ответом, ориентированный на указанную должность и список компетенций.
Каждый вопрос — практический рабочий кейс. 4 варианта ответа, один правильный. Покрытие: каждая компетенция минимум 1 вопрос.
Верни СТРОГО валидный JSON:
{"title":"...","description":"...","questions":[{"id":"q1","text":"...","competency":"...","options":[{"id":"a","text":"..."}],"correct_option_id":"a","weight":1}]}
TXT;

    public function __construct(protected AiGatewayService $ai)
    {
    }

    public function generate(string $positionTitle, array $competencies = []): array
    {
        $compList = $competencies ?: [
            'Коммуникация', 'Аналитическое мышление', 'Командная работа', 'Решение проблем', 'Адаптивность',
        ];

        $prompt = "Должность: {$positionTitle}\nКлючевые компетенции: " . implode(', ', $compList) .
            "\n\nСгенерируй тест из 12 закрытых вопросов. Распредели вопросы равномерно между компетенциями.";

        $parsed = $this->ai->chatJson([
            ['role' => 'system', 'content' => self::SYSTEM],
            ['role' => 'user', 'content' => $prompt],
        ], default: ['questions' => []]);

        $questions = collect($parsed['questions'] ?? [])
            ->filter(fn ($q) => ! empty($q['text']) && ! empty($q['options']) && ! empty($q['correct_option_id']))
            ->values()
            ->map(function ($q, $i) use ($compList) {
                return [
                    'id' => $q['id'] ?? 'q' . ($i + 1),
                    'text' => trim((string) $q['text']),
                    'competency' => trim((string) ($q['competency'] ?? $compList[0])),
                    'options' => collect($q['options'])->values()->map(fn ($o, $j) => [
                        'id' => $o['id'] ?? chr(97 + $j),
                        'text' => trim((string) ($o['text'] ?? '')),
                    ])->all(),
                    'correct_option_id' => (string) $q['correct_option_id'],
                    'weight' => (int) ($q['weight'] ?? 1),
                ];
            })
            ->filter(fn ($q) => collect($q['options'])->contains(fn ($o) => $o['id'] === $q['correct_option_id']))
            ->values()
            ->all();

        return [
            'title' => $parsed['title'] ?? "Тест: {$positionTitle}",
            'description' => $parsed['description'] ?? 'AI-сгенерированный тест под вашу должность',
            'questions' => $questions,
        ];
    }
}
