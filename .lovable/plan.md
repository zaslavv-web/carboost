# Правки не доехали до приложения: git pull кладёт их в подпапку

## Что произошло (по вашему выводу)

`git pull` в `/home/gro7659365/growth-peak.pro/docs/backend` вытянул файлы по путям `backend-laravel/app/...`, `backend-laravel/database/migrations/...`. То есть в этой папке лежит клон всего репозитория, и новые файлы легли в `docs/backend/backend-laravel/`, а само Laravel-приложение работает из `docs/backend/`.

Отсюда обе ошибки:

- `INFO Nothing to migrate` — миграция `0031_00_02_000000_dedupe_chat_participants.php` лежит в `docs/backend/backend-laravel/database/migrations/`, а artisan смотрит в `docs/backend/database/migrations/`;
- `chat:diagnose` не существует — команда тоже в подпапке.

Деплой-workflow `deploy-backend.yml` синхронизирует содержимое `backend-laravel/` **внутрь** `docs/backend` (`BACKEND_ROOT=$ROOT/backend`) — это правильный путь доставки. Ручной `git pull` в той же папке даёт вложенную копию и ничего не обновляет.

Дополнительно: `chat:diagnose {user_id}` и `<ваш_user_id>` — это плейсхолдеры, в bash их надо заменить реальным id (угловые скобки bash трактует как редирект, отсюда `syntax error near unexpected token`).

## Шаг 1. Доставить код правильным способом

Основной путь — запустить GitHub Action «Deploy Backend» (`workflow_dispatch`, `run_migrations = true`). Он делает rsync `backend-laravel/` → `docs/backend`, composer install, миграции и проверку `/api/health`.

Резервный путь вручную, если Action недоступен:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull
rsync -a --exclude '.env' --exclude 'storage' backend-laravel/ ./
php artisan migrate --force && php artisan optimize:clear
php artisan list | grep chat:diagnose
```

## Шаг 2. Запустить диагностику с реальным id

Сначала узнать id пользователя, у которого падают чаты:

```bash
php artisan tinker --execute="echo \App\Models\User::where('email','<email>')->value('id');"
```

Затем:

```bash
php -d memory_limit=512M artisan chat:diagnose <полученный_id>
```

Вывод покажет число диалогов, строк `chat_participants` и дублей, объём сообщений и пик памяти по шагам — это и назовёт источник 250 МБ.

## Шаг 3. Устранить путаницу с путями на будущее

Чтобы больше не было вложенной копии:

- добавить в `DEPLOYMENT.md` явное правило: в `docs/backend` **не** делать `git pull`, доставка только через Action;
- добавить в `deploy-backend.yml` шаг-проверку: если на сервере существует `docs/backend/backend-laravel`, workflow пишет предупреждение (устаревшая вложенная копия) и удаляет её, чтобы автозагрузчик не подхватывал дубли классов.

## Технические детали

Меняются только `DEPLOYMENT.md` и `.github/workflows/deploy-backend.yml`. Код бэкенда и фронтенда из прошлого шага уже в репозитории и корректен — вопрос исключительно в доставке на сервер.
