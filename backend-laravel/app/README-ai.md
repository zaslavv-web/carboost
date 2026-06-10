# AI services (Laravel)

Все AI-функции работают через единый клиент `App\Services\AI\AiGatewayService`,
совместимый с любым OpenAI-style endpoint.

## Конфигурация

`.env`:

```
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
AI_MODEL_PRO=gpt-4o            # для assessment-chat (опционально)
```

Поддерживаемые провайдеры (любой OpenAI-совместимый):
- OpenAI — `https://api.openai.com/v1/chat/completions`
- OpenRouter — `https://openrouter.ai/api/v1/chat/completions`
- self-hosted vLLM — `http://vllm:8000/v1/chat/completions`
- Ollama — `http://ollama:11434/v1/chat/completions`
- любой внутренний gateway по контуру компании

## Структура

| Файл | Назначение |
|------|------------|
| `app/Services/AI/AiGatewayService.php` | Базовый клиент: `chat`, `chatText`, `chatJson`, `chatToolCall`, `streamChat` (SSE). |
| `app/Services/AI/AssessmentChatService.php` | Стриминговый интервью-чат с rubric и tool `complete_assessment`. |
| `app/Services/AI/GenerateClosedTestService.php` | 12 закрытых вопросов под должность + компетенции. |
| `app/Services/AI/GenerateStepScenarioService.php` | Сценарий проверки этапа карьерного трека + опциональный тест. |
| `app/Services/AI/GenerateDefaultTrackStepsService.php` | Дефолтные этапы карьерного трека на N месяцев. |
| `app/Services/AI/HrAnalyticsAiService.php` | `generate-career-paths`, `generate-positions-from-org`, `generate-questionnaire-profile`, `suggest-ticket-fix`. |
| `app/Services/AI/DocumentParserService.php` | `parse-position-standards`, `parse-hr-document`, `parse-org-structure`, `parse-test-document`. |
| `app/Http/Controllers/Api/AiController.php` | HTTP-фасад с валидацией + единая обработка ошибок. |

## Маршруты (`routes/api.php`, prefix `/api/ai`)

Все защищены `auth:sanctum` + `effective.user` + `verified.user` + `has.company`.

| Endpoint |
|----------|
| `POST /api/ai/assessment-chat` (SSE) |
| `POST /api/ai/generate-closed-test` |
| `POST /api/ai/generate-step-scenario` |
| `POST /api/ai/generate-default-track-steps` |
| `POST /api/ai/generate-career-paths` |
| `POST /api/ai/generate-positions-from-org` |
| `POST /api/ai/generate-questionnaire-profile` |
| `POST /api/ai/suggest-ticket-fix` |
| `POST /api/ai/parse-position-standards` |
| `POST /api/ai/parse-hr-document` |
| `POST /api/ai/parse-org-structure` |
| `POST /api/ai/parse-test-document` |

## Стриминг

`AiGatewayService::streamChat()` возвращает Symfony `StreamedResponse` с заголовком
`text/event-stream`, проксируя SSE upstream-а.

## Обработка ошибок

Все сервисы единообразно бросают `AiGatewayException`:
- `429` — лимит запросов
- `402` — закончились кредиты AI
- остальное — 500

## Зависимости для парсинга файлов

```bash
composer require phpoffice/phpspreadsheet smalot/pdfparser
```

Если пакеты не установлены — сервис деградирует к чистому тексту/CSV.
