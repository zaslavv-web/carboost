<?php

namespace App\Services\AI;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Replaces edge function: assessment-chat
 * Streaming SSE chat for competency interview with strict rubric.
 */
class AssessmentChatService
{
    public const SYSTEM_PROMPT = <<<'TXT'
Ты — СТРОГИЙ AI-эксперт по оценке компетенций сотрудников. Твоя задача — провести профессиональное интервью и честно оценить кандидата, а не просто принять любые ответы.

КЛЮЧЕВЫЕ ПРИНЦИПЫ ОЦЕНКИ:
1. НИКОГДА не принимай общие ответы вроде «я хорошо лажу с людьми», «я лидер», «я всё умею». Требуй КОНКРЕТИКУ: цифры, кейсы, метрики, результаты, сроки.
2. Если ответ слишком общий, расплывчатый, бахвальный или без доказательств — обязательно задай уточняющий follow-up вопрос.
3. Если кандидат на follow-up снова отвечает общими фразами — это сигнал низкого балла по этой компетенции.
4. Хвалить можно только за КОНКРЕТНЫЕ доказательства.

СТРУКТУРА ИНТЕРВЬЮ (12-14 вопросов):
- 2 на ЛИДЕРСТВО, 2 на ТЕХНИЧЕСКИЕ НАВЫКИ, 2 на КОММУНИКАЦИЮ,
- 2 на АНАЛИТИКУ, 2 на УПРАВЛЕНИЕ ПРОЕКТАМИ, 2 на АДАПТИВНОСТЬ.

После всех вопросов вызови complete_assessment.
По умолчанию ставь оценки 40-65; высокие баллы (>75) — только при наличии конкретных метрик.
Тон профессиональный, нейтральный, на русском.
TXT;

    public function __construct(protected AiGatewayService $ai, protected RagService $rag)
    {
    }

    public function stream(array $messages, ?string $companyId = null): StreamedResponse
    {
        $tools = [[
            'type' => 'function',
            'function' => [
                'name' => 'complete_assessment',
                'description' => 'Вызывается ПОСЛЕ всех вопросов. Строгая итоговая оценка.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'overall_score' => ['type' => 'number'],
                        'competencies' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'skill_name' => ['type' => 'string'],
                                    'skill_value' => ['type' => 'number'],
                                    'justification' => ['type' => 'string'],
                                ],
                                'required' => ['skill_name', 'skill_value', 'justification'],
                            ],
                        ],
                        'summary' => ['type' => 'string'],
                        'strengths' => ['type' => 'array', 'items' => ['type' => 'string']],
                        'growth_areas' => ['type' => 'array', 'items' => ['type' => 'string']],
                    ],
                    'required' => ['overall_score', 'competencies', 'summary', 'strengths', 'growth_areas'],
                ],
            ],
        ]];

        $systemPrompt = self::SYSTEM_PROMPT;
        $sources = [];
        if ($companyId) {
            $query = $this->extractQuery($messages);
            if ($query !== '') {
                try {
                    $hits = $this->rag->search($companyId, $query, 5);
                    if ($hits) {
                        $ctxParts = [];
                        foreach ($hits as $i => $h) {
                            $title = $h['title'] ? " — {$h['title']}" : '';
                            $chunk = trim((string) ($h['chunk_text'] ?? ''));
                            $ctxParts[] = '[' . ($i + 1) . $title . "]\n" . $chunk;
                            $snippet = mb_substr($chunk, 0, 320);
                            if (mb_strlen($chunk) > 320) $snippet .= '…';
                            $sources[] = [
                                'title'     => $h['title'],
                                'source_id' => $h['source_id'],
                                'score'     => $h['score'],
                                'snippet'   => $snippet,
                            ];
                        }
                        $systemPrompt .= "\n\n=== КОНТЕКСТ КОМПАНИИ (RAG) ===\n" . implode("\n\n", $ctxParts);
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('Assessment RAG failed', ['error' => $e->getMessage()]);
                }
            }
        }

        $response = $this->ai->streamChat([
            'model' => env('AI_MODEL_PRO', 'google/gemini-2.5-pro'),
            'messages' => array_merge(
                [['role' => 'system', 'content' => $systemPrompt]],
                $messages,
            ),
            'tools' => $tools,
        ]);

        // Источники RAG доступны фронтенду через заголовок (без вмешательства в SSE-поток).
        if ($sources) {
            $response->headers->set('X-Rag-Sources', json_encode($sources, JSON_UNESCAPED_UNICODE));
            $response->headers->set('Access-Control-Expose-Headers', 'X-Rag-Sources');
        }

        return $response;
    }

    protected function extractQuery(array $messages): string
    {
        $userMsgs = array_values(array_filter($messages, fn ($m) => ($m['role'] ?? '') === 'user'));
        $last = end($userMsgs);
        if (! $last) return '';
        $content = $last['content'] ?? '';
        if (is_array($content)) {
            $content = collect($content)->pluck('text')->filter()->implode(' ');
        }
        return trim((string) $content);
    }
}
