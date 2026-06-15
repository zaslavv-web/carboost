# План: AI в закрытом контуре клиента

## Цель

Дать возможность развёртывать "Career Track" в изолированном контуре компании, где доступ к Lovable/Gemini закрыт. AI должен работать через один из локальных/российских провайдеров **либо** показывать заглушку, если AI отключён администратором. Конфигурация — через UI Superadmin без передеплоя.  
  
ВАЖНО! Если отсутствует подключение к  АИ, но пользователи обращаются к функционалу, то нужно отправить админу продукта (сотрудник на стороне компании) уведомление о необходимости интеграции. При этом в момент первичной развертки админ сам настраивает количество обращений, после которых ему должен прийти пуш.  
Настраивает он это в настройках компании (отдельный функционал админа)

## Архитектура

```text
┌─────────────────────┐
│  Бизнес-сервисы     │  AssessmentChat, GenerateTest,
│  (Laravel)          │  ParseDocument, HrAnalytics ...
└──────────┬──────────┘
           │ единый интерфейс LlmDriverInterface
           ▼
┌─────────────────────┐
│  AiGatewayService   │  читает ai_settings (БД) → выбирает драйвер
└──────────┬──────────┘
           │
   ┌───────┼────────┬────────────┬──────────────┐
   ▼       ▼        ▼            ▼              ▼
 Gemini  Yandex  GigaChat  OpenAI-compat   Internal-RAG
 (cloud) GPT     (Сбер)    (vLLM/Ollama)   (Ollama + Qdrant)
```

## Backend (Laravel)

### 1. Таблица `ai_settings` (single-row, multi-tenant)

- `id`, `company_id` (nullable — глобальный fallback для Superadmin)
- `provider` enum: `gemini` | `yandexgpt` | `gigachat` | `openai_compatible` | `internal_rag` | `disabled`
- `model` (например, `yandexgpt/latest`, `GigaChat-Pro`, `qwen2.5:14b`)
- `api_url`, `api_key` (зашифрованы через `Crypt::encryptString`)
- `extra_json` (folder_id для Yandex, scope для GigaChat, temperature, max_tokens)
- `rag_enabled` bool, `rag_index_status` enum: `idle|indexing|ready|error`
- `disabled_message` (текст заглушки для пользователей)

### 2. Рефакторинг `AiGatewayService`

- Извлечь интерфейс `LlmDriverInterface { chat(messages, opts), stream(messages, opts) }`.
- Драйверы в `app/Services/AI/Drivers/`:
  - `GeminiDriver` (текущая логика)
  - `YandexGptDriver` — `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`, IAM-токен или API-ключ + `folder_id`
  - `GigaChatDriver` — OAuth2 client_credentials, `https://gigachat.devices.sberbank.ru/api/v1/chat/completions`, mTLS-сертификат (опционально)
  - `OpenAICompatibleDriver` — для vLLM/Ollama/LM Studio/Azure OpenAI (один универсальный)
  - `DisabledDriver` — кидает `AiDisabledException` с `disabled_message`
- Все существующие сервисы (`AssessmentChatService`, `GenerateClosedTestService`, `GenerateStepScenarioService`, `GenerateDefaultTrackStepsService`, `HrAnalyticsAiService`, `DocumentParserService`) переписать на интерфейс — без привязки к Gemini-специфичному `contents/parts`.
- SSE-стриминг (`AssessmentChat`) — нормализовать к OpenAI-style chunk'ам внутри драйвера.

### 3. RAG для "внутренней" LLM

Это RAG, **не** fine-tuning (fine-tune под каждого клиента нереалистичен по стоимости/времени; ответ модели должен опираться на актуальные документы компании).

- Векторная БД: **Qdrant** (open-source, ставится рядом в docker-compose) или `pgvector` в существующем Postgres.
- Embeddings: локальная модель `bge-m3` / `multilingual-e5-large` через тот же Ollama.
- Новая таблица `rag_documents`: `company_id`, `source_type` (hr_policy, position, career_track, ticket, employee_profile, custom_upload), `source_id`, `chunk_text`, `embedding`, `metadata`, `indexed_at`.
- `RagIndexerService`:
  - Команда `php artisan rag:reindex --company=X` — индексирует HR-политики, позиции, треки, профили, тикеты.
  - Чанкинг 1–2KB с overlap, метаданные (роль, дата, тип).
  - Очередь Laravel (queue:work) для фоновой индексации.
  - Триггеры на сохранение документов → авто-инкрементальное обновление.
- `InternalRagDriver`:
  1. Embedding запроса → top-K чанков из Qdrant (фильтр по `company_id`).
  2. Промпт: системка + контекст из чанков + история сообщений.
  3. Вызов локальной LLM через OpenAI-совместимый адаптер.
  4. В ответе возвращает источники (для UI "источник: HR-политика §3.2").

### 4. API

- `GET /api/admin/ai-settings` (Superadmin/Company Admin)
- `PUT /api/admin/ai-settings`
- `POST /api/admin/ai-settings/test` — пробный вызов, возвращает latency/ошибку
- `POST /api/admin/ai-settings/rag/reindex` — запуск переиндексации
- `GET /api/admin/ai-settings/rag/status` — прогресс

### 5. Middleware

`EnsureAiEnabled` — если провайдер `disabled`, возвращает `423 Locked` с `disabled_message`.

## Frontend (React)

### 1. Страница `/ai-settings` (Superadmin + Company Admin)

- Селектор провайдера (карточки с описанием).
- Поля в зависимости от провайдера:
  - **YandexGPT**: API-ключ, `folder_id`, модель (`yandexgpt`, `yandexgpt-lite`, `yandexgpt-32k`).
  - **GigaChat**: client_id, client_secret, scope (`GIGACHAT_API_PERS` / `_B2B` / `_CORP`), модель.
  - **OpenAI-compatible**: base_url, api_key, model.
  - **Internal RAG**: base_url Ollama, embedding model, chat model, кнопка "Переиндексировать БЗ".
  - **Disabled**: только текст заглушки.
- Кнопка "Проверить соединение" → вызывает `/test`, показывает результат.
- Блок RAG: статус индекса, количество чанков по типам, кнопка реиндекса.

### 2. Хук `useAiAvailability`

- Загружает `ai_settings.provider !== 'disabled'`.
- Если выключен — оборачивает AI-кнопки в `<AiDisabledTooltip>`: кнопка видна, но кликабельна → toast "AI отключён администратором: {disabled_message}".

### 3. Затронутые экраны (показ заглушки)

`Assessment`, `CareerTracksManagement`, `EmployeeQuestionnaire`, `HRDTests`, `HRPolicies`, `Scenarios`, `Positions`, `Support` — обернуть AI-триггеры через `useAiAvailability`.

### 4. Локализация

`ai.disabled.title`, `ai.disabled.defaultMessage`, `ai.settings.*`, `ai.rag.*` в `ru/en common.json`.

## Деплой в закрытом контуре

`docker-compose.client.yml` (поставляется заказчику):

- `app` (Laravel + React build)
- `postgres` (с `pgvector` extension)
- `qdrant` (опционально, если не используем pgvector)
- `ollama` с предзагруженными моделями: `qwen2.5:14b-instruct`, `bge-m3` (рекомендация для RU+EN, среднее железо: 1×A10 24GB)
- Альтернатива — клиент указывает endpoint своего YandexGPT/GigaChat, тогда Ollama не нужен.

Документация `DEPLOYMENT_OFFLINE.md`:

- Минимальные требования железа для каждого провайдера.
- Инструкция настройки YandexGPT (получение API-ключа + folder_id).
- Инструкция настройки GigaChat (регистрация в Studio, mTLS-сертификат для CORP).
- Объём документов для RAG (рекомендация: 50–500 МБ текста на компанию).

## Что НЕ входит в этот план

- Fine-tuning моделей под клиента (нереалистично для on-prem поставки; RAG покрывает 95% случаев).
- Federated learning / обучение на пользовательских данных в реальном времени.
- Поддержка Anthropic/Mistral/Cohere облачных API (легко добавить позже через `OpenAICompatibleDriver`).

## Этапы реализации

1. **Миграция + рефакторинг `AiGatewayService` → драйверы** (Gemini + Disabled — для обратной совместимости).
2. `**YandexGptDriver` + `GigaChatDriver` + `OpenAICompatibleDriver**` + тесты.
3. **UI `/ai-settings**` + `useAiAvailability` + обёртки на 8 экранах.
4. **RAG-слой**: миграция `rag_documents`, `RagIndexerService`, `InternalRagDriver`, UI индексации.
5. **docker-compose.client.yml + DEPLOYMENT_OFFLINE.md**.

Реализация большая — рекомендую делать по одному этапу за итерацию. Подтвердите, начинать ли с этапа 1, или сразу нужны все 5.  
сразу все 5  
после реализации запусти тесты:  
1) тест на стрессоустойчивость системы  
2) стресс-тест на то как новый функционал аффектит старый  
3) тест на оптимизацию  
4) автотесты на весь функционал

&nbsp;