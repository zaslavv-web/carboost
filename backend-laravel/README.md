# overlay/

Содержимое этой папки **копируется поверх свежего Laravel-каркаса** скриптом
`scripts/bootstrap.sh`. Здесь живут только наши кастомные файлы:

- `.env.example` — шаблон окружения (см. родительский README)
- `app/` — Models, Controllers, Policies, Services, Jobs, Events (наполняется в фазах 3–8)
- `config/` — переопределения `sanctum.php`, `services.php`, `broadcasting.php`
- `database/migrations/` — формальные миграции поверх Supabase-дампа (см. `database/migrations/README.md`)
- `database/seeders/` — сидеры (роли Spatie из `public.user_roles`)
- `routes/api.php` — все API-эндпоинты

Фазы:
- **Фаза 1** (готово): инфраструктура (docker, php-fpm, nginx, reverb, postgres, redis), bootstrap-скрипт.
- **Фаза 2** (готово): миграции БД поверх дампа Supabase + сидер ролей.
- **Фаза 3+** (следующие): Auth, Policies, контроллеры, AI, Realtime, Storage, фронт.
