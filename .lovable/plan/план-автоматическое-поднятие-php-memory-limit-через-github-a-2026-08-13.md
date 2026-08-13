# План: автоматическое поднятие PHP memory_limit через GitHub Actions

## Цель
Исключить ручные правки на сервере: при каждом деплое бэкенда в `main` автоматически выставлять `memory_limit = 256M` для runtime-запросов Laravel и фиксировать текущий лимит в health check.

## Почему .user.ini
На shared-хостинге `nichost` нет root-доступа к глобальному `php.ini`. Директива `memory_limit` поддерживает переопределение через `.user.ini` в каталоге `public/` (PHP per-directory settings). CLI-команды (`composer install`, `artisan migrate`) уже запускаются с `php -d memory_limit=-1` в workflow.

## Что изменится

### 1. Файл `backend-laravel/public/.user.ini`
Создать/перезаписать в корне public:
```ini
memory_limit = 256M
post_max_size = 64M
upload_max_filesize = 64M
max_execution_time = 120
```
`post_max_size` и `upload_max_filesize` — сопутствующие лимиты, чтобы большие импорты/парсинг документов не упирались в соседние ограничения.

### 2. Шаг в `.github/workflows/deploy-backend.yml`
После `Install, migrate, refresh Laravel caches` добавить шаг **Set PHP runtime limits via .user.ini**:
- Записать `.user.ini` в `$BACKEND_ROOT/public/.user.ini`.
- Установить права `644`.
- Проверить, что FPM подхватывает значение: вызвать `php -i | grep memory_limit` и `php -r "echo ini_get('memory_limit');"` на сервере.
- Проверить, что `public/.user.ini` не был удалён при `rsync --delete`: добавить файл в исключения не требуется, т.к. он будет в репозитории, но шаг перезаписывает его явно.

### 3. Health check с диагностикой лимита
В `public health check` шаге дополнительно проверить ответ `/api/health`:
- Если health endpoint не возвращает `memory_limit` — добавить в ответ поле `memory_limit` (через `app/Http/Controllers/Api/HealthController.php` или `routes/api.php`).
- Workflow фейлится, если `memory_limit < 256M`.

### 4. Документация
Обновить `DEPLOYMENT.md`:
- Раздел «Деплой бэкенда»: добавить пункт про `.user.ini` и runtime-лимиты.
- Указать, что ручное поднятие через `php.ini` больше не требуется.

## Критерий готовности
- После push в `main` workflow «Deploy Backend» завершается успешно.
- `curl https://growth-peak.pro/api/health` возвращает `memory_limit: "256M"`.
- Логи `fatal_request` больше не содержат `memory_limit` меньше 256M.

## Не входит в план
- Переезд на выделенный сервер или смена тарифа хостинга.
- Оптимизация запросов (чаты, аналитика) — это отдельная задача, которая пойдет параллельно, но лимит нужен в любом случае.
