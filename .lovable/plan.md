## План проверки: smoke по всем AI-функциям

Идея — прогнать каждый AI-эндпоинт живым минимальным запросом с текущими настройками YandexGPT и зафиксировать статус (OK / HTTP-код + причина). Ошибки логируем в `ai_gateway_logs` и в Laravel-логах.

### Что проверяем (по маршрутам из `routes/api.php`)

1. `POST /api/ai-settings/test` — уже прошёл (pong 553ms), базовая линия.
2. `POST /api/ai/assessment-chat` — SSE-стриминг ответа модели.
3. `POST /api/ai/generate-step-scenario` — генерация JSON-сценария оценки.
4. `POST /api/ai/generate-default-track-steps` — дефолтные шаги трека.
5. `POST /api/ai/generate-closed-test` — генерация теста с вариантами.
6. `POST /api/ai/generate-career-paths` — построение путей по должностям.
7. `POST /api/ai/generate-positions-from-org` — извлечение должностей из оргструктуры.
8. `POST /api/ai/generate-questionnaire-profile` — сборка анкеты компетенций.
9. `POST /api/ai/suggest-ticket-fix` — AI-подсказка по тикету поддержки.
10. `POST /api/ai/parse-hr-document` — блочный парсинг HR-документа (chunk 8KB).
11. `POST /api/ai/parse-org-structure` — парсинг оргструктуры.
12. `POST /api/ai/parse-position-standards` — парсинг стандартов должности.
13. `POST /api/ai/parse-test-document` — парсинг документа в тест.
14. `POST /api/rag/search` — поиск по корпоративной базе знаний (если есть индексация).

### Как проверять

Через UI, а не curl'ом — так покроем и клиентскую сборку payload'а:

- **assessment-chat**: `/assessment` → «AI-интервью» → отправить одно сообщение, дождаться стрима.
- **generate-step-scenario / questionnaire-profile / closed-test / default-track-steps / career-paths**: HRD-модуль → «Треки карьеры» / «Оценки» / «Тесты» → кнопки «Сгенерировать AI».
- **generate-positions-from-org / parse-org-structure**: раздел «Должности» / «Оргструктура» → «Импортировать» → загрузить маленький .txt.
- **parse-hr-document / parse-position-standards / parse-test-document**: соответствующие импорт-мастера.
- **suggest-ticket-fix**: раздел «Поддержка» → любой тикет → «AI-подсказка».
- **rag/search**: если есть проиндексированные документы — поисковая строка в базе знаний.

Пойдём по разделам сверху вниз. После каждого шага я смотрю в `ai_gateway_logs` (`status`, `error_type`, `error_message`), при ошибке — читаю подробности через `get_ai_gateway_request` и предлагаю фикс (обычно это либо параметры payload'а под Yandex, либо квоты Foundation Models).

### Что от вас нужно

Просто открывать раздел, нажимать AI-кнопку и говорить, что видите (либо просто «дальше» — я тогда буду по одному разделу проверять статусы в логах). Начнём с **AI-интервью** — откройте `/assessment` и запустите чат, отправьте одно сообщение.
