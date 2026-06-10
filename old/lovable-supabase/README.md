# Архив Lovable / Supabase

Сюда перенесены артефакты от внешних сервисов (Lovable Cloud, Supabase),
которые **не используются** в production-сборке Career Track.

Прод работает только на Laravel + PostgreSQL + Redis + AI Gateway,
поэтому всё содержимое этой папки можно безопасно удалить, если вы уверены,
что откат к Lovable Cloud не понадобится.

## Состав

| Папка / файл | Что внутри |
|---|---|
| `src-integrations-supabase/` | Бывший `src/integrations/supabase/` — Supabase JS-клиент. Фронт его не импортировал ни в одном файле. |
| `supabase/` | Миграции и edge-functions Supabase. Заменены Laravel-миграциями (`backend-laravel/database/migrations/`) и Laravel-сервисами (`backend-laravel/app/Services/AI/*`). |
| `docs/AUTH_DOMAIN_SETUP.md` | Старая инструкция по настройке домена для Lovable Email. Сейчас отправка писем идёт через SMTP (Yandex/любой) — см. `docs/EMAIL_SETUP.md`. |
| `test-sync.md` | Служебный файл Lovable. |

## On-premise

Никаких внешних SaaS-зависимостей в проде нет. См. `docs/ON-PREMISE.md`
для инструкции развёртывания на собственном сервере.
