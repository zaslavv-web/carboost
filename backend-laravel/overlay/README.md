# overlay/

Содержимое этой папки **копируется поверх свежего Laravel-каркаса** скриптом
`scripts/bootstrap.sh`. Здесь живут только наши кастомные файлы:

- `.env.example` — шаблон окружения (см. родительский README)
- `app/` — Models, Controllers, Policies, Services, Jobs, Events (наполняется в фазах 3–8)
- `config/` — переопределения `sanctum.php`, `services.php`, `broadcasting.php`
- `database/migrations/` — формальные миграции поверх Supabase-дампа
- `routes/api.php` — все API-эндпоинты

Сейчас (Фаза 1) overlay содержит только `.env.example`. Всё остальное появится
в следующих фазах согласно `.lovable/plan.md`.
