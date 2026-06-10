# Career Track — Deployment

Полная инструкция по on-premise развёртыванию находится в [`docs/ON-PREMISE.md`](docs/ON-PREMISE.md).

Кратко:

- Frontend: React + Vite, собирается командой `bun install && bun run build`, артефакты в `dist/`.
- Backend: Laravel 11 + Sanctum в `backend-laravel/`.
- БД: PostgreSQL.
- Кэш / очереди: Redis.
- AI: любой OpenAI-совместимый endpoint через `AI_API_URL` / `AI_API_KEY` (можно self-hosted vLLM / Ollama / внутренний шлюз).
- Почта: SMTP (по умолчанию Yandex 360, см. `backend-laravel/config/service-infra.php`).

См. также `docker-compose.yml` для контейнерного запуска и `deploy/` для конфигов nginx / php-fpm.

Архив устаревших артефактов (legacy, Lovable Cloud) — `old/lovable-legacy/`.
