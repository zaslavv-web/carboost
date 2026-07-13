# services/

Каждый подкаталог — отдельный сервис Growth Peak с собственным `rtfm_<name>.md`.

| Сервис | Ответственность | Документ |
|---|---|---|
| `ai/` | LLM, RAG, парсинг документов, чат-оценка | [`rtfm_ai.md`](./ai/rtfm_ai.md) |
| `chat/` | Мессенджер + Reverb WS | [`rtfm_chat.md`](./chat/rtfm_chat.md) |
| `analytics/` | People Analytics, риски, comfort | [`rtfm_analytics.md`](./analytics/rtfm_analytics.md) |
| `automation/` | Правила авто-назначений и эскалаций | [`rtfm_automation.md`](./automation/rtfm_automation.md) |
| `notifications/` | E-mail, webhooks, iCal, in-app | [`rtfm_notifications.md`](./notifications/rtfm_notifications.md) |
| `gamification/` | Магазин наград, ledger валюты | [`rtfm_gamification.md`](./gamification/rtfm_gamification.md) |
| `ingest/` | Storage, парсинг оргструктуры, GeoIP | [`rtfm_ingest.md`](./ingest/rtfm_ingest.md) |

Границы, контракты и переменные окружения фиксируются в rtfm-файлах. Физическое разнесение кода из `backend-laravel/` (будущего `core/`) в эти папки — этапы 4–5 плана (`.lovable/plan.md`).
