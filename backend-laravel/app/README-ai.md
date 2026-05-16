# Phase 7 — AI services (Edge Functions → Laravel)

All Supabase Edge Functions из `backend/supabase/functions/*` переписаны как Laravel-сервисы поверх единого AI gateway-клиента.

## Конфигурация

`.env`:

```
AI_API_URL=https://ai.gateway.lovable.dev/v1/chat/completions
AI_API_KEY=sk-...           # либо LOVABLE_API_KEY (fallback)
AI_MODEL=google/gemini-2.5-flash
AI_MODEL_PRO=google/gemini-2.5-pro   # для assessment-chat (опционально)
```

Совместимо с любым OpenAI-style endpoint: Lovable AI, OpenAI, OpenRouter, vLLM, Ollama.

## Структура

| Файл | Назначение |
|------|------------|
| `app/Services/AI/AiGatewayService.php` | Базовый клиент: `chat`, `chatText`, `chatJson`, `chatToolCall`, `streamChat` (SSE). Бросает `AiGatewayException` на 429/402/5xx. |
| `app/Services/AI/AssessmentChatService.php` | Стриминговый интервью-чат с rubric и tool `complete_assessment`. |
| `app/Services/AI/GenerateClosedTestService.php` | 12 закрытых вопросов под должность + компетенции. |
| `app/Services/AI/GenerateStepScenarioService.php` | Сценарий проверки этапа карьерного трека + опциональный тест. |
| `app/Services/AI/GenerateDefaultTrackStepsService.php` | Дефолтные этапы карьерного трека на N месяцев. |
| `app/Services/AI/HrAnalyticsAiService.php` | `generate-career-paths`, `generate-positions-from-org`, `generate-questionnaire-profile`, `suggest-ticket-fix`. |
| `app/Services/AI/DocumentParserService.php` | `parse-position-standards`, `parse-hr-document`, `parse-org-structure`, `parse-test-document` (CSV/XLSX/PDF/text). |
| `app/Http/Controllers/Api/AiController.php` | HTTP-фасад с валидацией + единая обработка ошибок. |

## Маршруты (`routes/api.php`, prefix `/api/ai`)

Все защищены `auth:sanctum` + `effective.user` + `verified.user` + `has.company`.

| Edge function (Supabase) | Laravel endpoint |
|--------------------------|------------------|
| `assessment-chat` (SSE) | `POST /api/ai/assessment-chat` |
| `generate-closed-test` | `POST /api/ai/generate-closed-test` |
| `generate-step-scenario` | `POST /api/ai/generate-step-scenario` |
| `generate-default-track-steps` | `POST /api/ai/generate-default-track-steps` |
| `generate-career-paths` | `POST /api/ai/generate-career-paths` |
| `generate-positions-from-org` | `POST /api/ai/generate-positions-from-org` |
| `generate-questionnaire-profile` | `POST /api/ai/generate-questionnaire-profile` |
| `suggest-ticket-fix` | `POST /api/ai/suggest-ticket-fix` |
| `parse-position-standards` | `POST /api/ai/parse-position-standards` |
| `parse-hr-document` | `POST /api/ai/parse-hr-document` |
| `parse-org-structure` | `POST /api/ai/parse-org-structure` |
| `parse-test-document` | `POST /api/ai/parse-test-document` |

## Стриминг

`AiGatewayService::streamChat()` возвращает Symfony `StreamedResponse` с заголовком
`text/event-stream`, проксируя SSE upstream-а. На фронтенде используйте обычный fetch
с reader-ом (как и прежде с edge-функцией) — формат сообщений совместим.

## Обработка ошибок

Все сервисы единообразно бросают `AiGatewayException`:
- `429` — лимит запросов
- `402` — закончились кредиты AI
- остальное — 500

Контроллер ловит и возвращает `{error: "..."}` со статусом из исключения.

## Зависимости для парсинга файлов

Для XLSX/PDF в `DocumentParserService`:
```bash
composer require phpoffice/phpspreadsheet smalot/pdfparser
```
Если пакеты не установлены — сервис деградирует к чистому тексту/CSV.

## admin-create-user

Эта функция была чисто Supabase Auth Admin API и УЖЕ перенесена в Phase 3
(`AuthController::register` + Superadmin endpoint в `ProfileController::verify`),
поэтому отдельный AI-сервис не нужен.

## Следующий шаг

**Фаза 8** — frontend integration: заменить вызовы `supabase.functions.invoke(...)`
на `axios.post('/api/ai/...')` через единый api-клиент Laravel + Sanctum.
