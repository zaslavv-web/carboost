<?php

namespace App\Services\AI;

/** Replaces edge functions: generate-career-paths, generate-positions-from-org, generate-questionnaire-profile, suggest-ticket-fix */
class HrAnalyticsAiService
{
    public function __construct(protected AiGatewayService $ai)
    {
    }

    /** generate-career-paths */
    public function generateCareerPaths(array $positions, array $departments): array
    {
        $sys = 'Ты HR-аналитик. По списку должностей и оргструктуры построй логичные карьерные пути. '
            . 'Отвечай СТРОГО JSON: {"career_paths":[{"from_position_id","to_position_id","estimated_months","strategy_description"}]}';
        $payload = "Должности:\n" . json_encode(array_map(fn ($p) => [
            'id' => $p['id'], 'title' => $p['title'] ?? null, 'department' => $p['department'] ?? null,
        ], $positions), JSON_UNESCAPED_UNICODE)
            . "\n\nОргструктура:\n" . json_encode(array_map(fn ($d) => [
                'id' => $d['id'], 'name' => $d['name'] ?? null, 'parent_id' => $d['parent_id'] ?? null,
            ], $departments), JSON_UNESCAPED_UNICODE);

        $result = $this->ai->chatJson(
            [['role' => 'system', 'content' => $sys], ['role' => 'user', 'content' => $payload]],
            ['career_paths' => []],
        );
        $ids = collect($positions)->pluck('id')->all();
        $result['career_paths'] = collect($result['career_paths'] ?? [])
            ->filter(fn ($cp) => in_array($cp['from_position_id'] ?? null, $ids, true)
                && in_array($cp['to_position_id'] ?? null, $ids, true)
                && $cp['from_position_id'] !== $cp['to_position_id'])
            ->values()->all();

        return $result;
    }

    /** generate-positions-from-org */
    public function generatePositionsFromOrg(array $departments): array
    {
        $sys = 'Ты HR-аналитик. По оргструктуре сгенерируй типовые должности (2-4 на отдел: руководитель, специалист, младший). '
            . 'JSON: {"positions":[{"title","department","description","competency_profile":[{"name","required_level"}],"psychological_profile":[{"trait","level"}]}]}';
        $tree = array_map(fn ($d) => [
            'name' => $d['name'] ?? null, 'description' => $d['description'] ?? null, 'parent_id' => $d['parent_id'] ?? null,
        ], $departments);

        return $this->ai->chatJson(
            [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => "Оргструктура:\n" . json_encode($tree, JSON_UNESCAPED_UNICODE) . "\n\nСгенерируй должности."],
            ],
            ['positions' => []],
        );
    }

    /** generate-questionnaire-profile */
    public function generateQuestionnaireProfile(array $answers, array $skillGaps = [], string $positionTitle = ''): array
    {
        $prompt = 'Сформируй черновик цифрового профиля сотрудника. JSON-схема: '
            . '{"summary","strengths":[],"growth_areas":[],"recommendations":[],"career_focus","risk_notes":[]}'
            . "\nДолжность: " . ($positionTitle ?: 'не указана')
            . "\nSkill gaps: " . substr(json_encode($skillGaps, JSON_UNESCAPED_UNICODE), 0, 6000)
            . "\nАнкета: " . substr(json_encode($answers, JSON_UNESCAPED_UNICODE), 0, 14000);

        return $this->ai->chatJson(
            [
                ['role' => 'system', 'content' => 'Ты HRD-аналитик. Без диагнозов и завышенных выводов. Только валидный JSON.'],
                ['role' => 'user', 'content' => $prompt],
            ],
            [
                'summary' => '', 'strengths' => [], 'growth_areas' => [],
                'recommendations' => [], 'career_focus' => '', 'risk_notes' => [],
            ],
            ['temperature' => 0.3],
        );
    }

    /** suggest-ticket-fix */
    public function suggestTicketFix(string $subject, ?string $description = null): array
    {
        $sys = 'Ты опытный специалист техподдержки HR-платформы. Дай: причину, пошаговую инструкцию, готовый ответ если применимо. На русском.';
        $suggestion = $this->ai->chatText([
            ['role' => 'system', 'content' => $sys],
            ['role' => 'user', 'content' => "Тема: {$subject}\n\nОписание: " . ($description ?: 'Не указано')],
        ]);
        return ['suggestion' => $suggestion];
    }
}
