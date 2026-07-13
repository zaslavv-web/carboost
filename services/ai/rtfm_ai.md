# rtfm_ai — AI-сервис (Growth Peak)

> Статус: **каркас (stage 1)**. Код физически ещё живёт в `backend-laravel/app/Http/Controllers/Api/Ai*.php` и `backend-laravel/app/Services/AI/`. Этот файл — контракт, к которому сервис будет приведён в stage 4–5 плана (`.lovable/plan.md`).

## 1. Назначение
AI-подсистема Growth Peak: генерация сценариев оценки, чат-оценка компетенций, парсинг документов, RAG над корпоративной базой знаний, генерация треков и закрытых тестов. Абстрагирует драйверы разных LLM-провайдеров (OpenAI-совместимые endpoint'ы: OpenAI, OpenRouter, Azure, self-hosted vLLM/Ollama).

## 2. Переменные окружения

| KEY | Обязат. | Описание | Пример | Где используется |
|---|---|---|---|---|
| `AI_API_URL` | да | OpenAI-совместимый chat/completions endpoint | `https://api.openai.com/v1/chat/completions` | `Services/AI/Drivers/*`, `AiGatewayService` |
| `AI_API_KEY` | да | Bearer-токен провайдера | `sk-...` | `AiGatewayService` |
| `AI_MODEL`   | да | Дефолтная модель | `gpt-4o-mini` | `AiGatewayService`, `AiSettingsResolver` |
| `AI_TIMEOUT` | нет | HTTP timeout к LLM, сек | `60` | `AiGatewayService` |
| `AI_RAG_ENABLED` | нет | Включить RAG-обогащение (0/1) | `1` | `RagService`, `RagController` |
| `AI_DOC_PARSER_CHUNK_KB` | нет | Размер блока при парсинге документа | `8` | `DocumentParserService` |

Секретные значения на проде — только в `EnvironmentFile=/etc/growthpeak/ai.env` (см. `docs/ON-PREMISE.md`).

## 3. Инфопотоки внутри сервиса

```text
SPA ──POST /api/ai/*──► AiController ──► AiGatewayService ──► LLM (OpenAI/OpenRouter/vLLM)
                            │
                            ├─► AssessmentChatService ──► LLM (SSE stream)
                            ├─► DocumentParserService ──► LLM (по блокам 8KB)
                            ├─► RagService ──► PG (embeddings) ──► LLM
                            └─► AiSettingsResolver ──► ai_settings (per-tenant override)
```

## 4. Связь с ядром (core)

- Ядро вызывает сервис через HTTP `POST /api/ai/*` (in-process в stage 4, отдельный контейнер в stage 5).
- Сервис читает из общей БД: `ai_settings`, `assessment_scenarios`, `assessments`, `rag_documents`, `rag_chunks`, `career_track_templates`, `closed_question_tests`.
- Общие events: `AssessmentCompleted` (публикует core после финализации).
- Общие очереди: `ai` (Redis) — фоновые задачи парсинга/эмбеддингов.

## 5. Публичные эндпоинты

| Метод | Путь | Роли | Описание |
|---|---|---|---|
| POST | `/api/ai/generate-scenario` | HRD, Admin | Сгенерировать сценарий оценки |
| POST | `/api/ai/generate-default-track-steps` | HRD, Admin | Дефолтные шаги трека |
| POST | `/api/ai/generate-closed-test` | HRD, Admin | Генерация закрытого теста |
| POST | `/api/ai/assessment-chat` (SSE) | Employee | Стриминг чат-оценки |
| POST | `/api/ai/parse-document` | HRD, Admin | Парсинг оргструктуры/HR-док |
| POST | `/api/ai/hr-analytics` | HRD | Ответ на аналитический запрос |
| GET  | `/api/ai/settings` | Admin, HRD | Текущие настройки провайдера |
| PATCH| `/api/ai/settings` | Admin | Обновить провайдера/модель |
| POST | `/api/rag/query` | authenticated | Поиск по корпоративной базе |
| POST | `/api/rag/ingest` | Admin | Индексация документа |

## 6. Запуск локально
```bash
# stage 1–4: сервис живёт внутри core
cd core && composer install && php artisan serve --port=8000
# stage 5 (после выноса):
cd services/ai && composer install && php artisan serve --port=8010
```

## 7. Тесты
`core/tests/Feature/AiControllerTest.php` — smoke на все эндпоинты с mocked driver.
