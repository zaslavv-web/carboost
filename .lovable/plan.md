# План: доставить исправленный backend на production

## Что происходит

- Production работает на старом backend-коммите `096f235` (на ~77 коммитов позади актуального).
- Поэтому все недавние исправления — chunked `ProfileController`, whitelist `positions` в `DbController`, memory-watchdog — на сервере отсутствуют.
- Запросы `/api/profiles?per_page=200` и `/api/db/positions` падают с 500/502 именно из-за старого кода.

## Что требуется от вас

### 1. Проверить секреты GitHub Actions для backend-деплоя

В репозитории должны быть настроены секреты (Settings → Secrets and variables → Actions):

- `SSH_PRIVATE_KEY` — приватный ключ для SSH на боевой сервер.
- `SSH_HOST` — хост сервера.
- `SSH_USER` — пользователь для SSH.
- `SSH_PATH` — путь до каталога backend на сервере (например, `/home/gro7659365/growth-peak.pro/docs/backend`).
- (опционально) `PHP_FPM_SERVICE` или reload-команда, если workflow не перезапускает PHP-FPM/Apache.

### 2. Запустить backend-деплой

- Сделать любой коммит в ветку, на которую настроен `.github/workflows/deploy-backend.yml`, либо запустить workflow вручную через вкладку Actions.
- Workflow должен выполнить `git pull`, `composer install`, `php artisan migrate`, очистку кэшей и reload воркеров.

### 3. Проверить, что production обновился

- Открыть `https://growth-peak.pro/api/health`.
- Убедиться, что поле `checks.version` совпадает с SHA последнего коммита (не `096f235`).
- Если версия осталась старой — деплой не доставил код.

### 4. Альтернатива: ручной деплой

Если GitHub Actions не настроен или не работает — выполнить шаги вручную на сервере:

```bash
cd /home/gro7659365/growth-peak.pro/docs/backend
git pull origin main
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:clear
php artisan cache:clear
php artisan view:clear
php artisan route:clear
# перезапустить PHP-FPM/Apache
```

## Критерий успеха

- `/api/health` возвращает актуальный `version`.
- `/api/profiles?per_page=200` и `/api/db/positions` отдают 200 для HRD-учетки.
- Время ответа обоих endpoint'ов менее 3 секунд.

## Следующий шаг после деплоя

Если 500 сохранятся на актуальной версии backend — провести новое расследование уже на свежем коде, а не на устаревшем `096f235`.
