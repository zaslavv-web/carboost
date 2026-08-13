# Замер прошёл: память в норме, проблема закрыта

## Что показали ваши цифры

```text
sapi=apache2handler  memory_limit=256M  app_debug=false
boot_mb=4  route_entry=4  after_user=4  after_profile=4  after_unread_query=4
peak_mb=4  tokens=19  loaded_files=544
/api/chats/unread-count -> {"unread":0}
```

Весь путь запроса (вход в роут → резолв пользователя → чтение профиля → агрегат unread) укладывается в 4 МБ при лимите 256 МБ. Прироста нет ни на одной стадии. `unread-count` под реальным токеном отвечает 200. Прежние `api_fatal` с пиком 250–256 МБ больше не воспроизводятся.

Причина прошлых падений — сочетание низкого лимита памяти веб-процесса и тяжёлых Eloquent-путей в чатах; и то, и другое уже устранено (raw SQL в `ChatController`, лимит 256M, вынос `unread-count` из тяжёлых middleware).

## План завершения

### 1. Наблюдение (2–3 дня, без изменений кода)

Периодически:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
grep -c "api_fatal" storage/logs/laravel.log
grep -n "api_memory_high" storage/logs/laravel.log | tail -20
```

Критерий закрытия: новых `api_fatal` нет, `api_memory_high` (порог 96 МБ) не появляется.

### 2. Уборка диагностики

- Удалить роут `/api/diag/request-memory` из `backend-laravel/routes/api.php`.
- Удалить команды `diag:memory` (`DiagnoseMemory.php`) и, при желании, оставить `user:diagnose` как read-only утилиту поддержки.
- Оставить: `MemoryWatchdog` (порог 96 МБ), `sql_slow`-логирование, расширенный `/api/health` — это дешёвая постоянная страховка.

### 3. Оставить как есть (защитные механизмы)

- Circuit breaker во фронте не размыкается фоновыми запросами (бейджи, аналитика).
- `unread-count` — лёгкая группа `auth:sanctum`, единый агрегат `COUNT` с `distinct()`.
- `EnsureVerified` / `EnsureHasCompany` отдают 503 `db_busy` вместо голого 500 при сбое БД.

## Технические детали

- Диагностический роут: `backend-laravel/routes/api.php` (группа `auth:sanctum`, ~строка 231).
- Команды: `backend-laravel/app/Console/Commands/DiagnoseMemory.php`, `DiagnoseUser.php`.
- Порог предупреждения: `backend-laravel/app/Http/Middleware/MemoryWatchdog.php`.
- После удаления роутов на сервере: `git pull` + `php artisan optimize:clear`.
