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

[gro7659365@gro7659365 ~]$ cd /home/gro7659365/growth-peak.pro/docs/backend
[gro7659365@gro7659365 backend]$ git pull origin main
php artisan cache:clear
php artisan view:clear
php artisan route:clear
# перезапустить PHP-FPM/Apacheremote: Enumerating objects: 396, done.
remote: Counting objects: 100% (263/263), done.
remote: Compressing objects: 100% (92/92), done.
remote: Total 396 (delta 184), reused 234 (delta 160), pack-reused 133 (from 1)
Receiving objects: 100% (396/396), 144.34 KiB | 1.59 MiB/s, done.
Resolving deltas: 100% (261/261), completed with 26 local objects.
From https://github.com/zaslavv-web/carboost
 * branch            main       -> FETCH_HEAD
   096f235..e32b927  main       -> origin/main
Updating 096f235..e32b927
Fast-forward
 .github/workflows/deploy-backend.yml               |  37 +-
 .github/workflows/deploy-frontend.yml              |  46 ++-
 .lovable/plan.md                                   |  56 +++
 ...\320\264\320\270\320\260\320\263-2026-08-13.md" | 129 ++++++
 ...\320\275\320\264\320\273\320\265-2026-08-13.md" |  31 ++
 ...\320\273\321\214\321\210\320\265-2026-08-13.md" |  28 ++
 ...\260-500-\320\275\320\260-api-db-2026-08-13.md" |  61 +++
 ...75\320\270\320\272\320\260-today-2026-08-13.md" |  55 +++
 ...\320\265\320\272\320\260\321\205-2026-08-13.md" |  44 ++
 ...\320\265\320\262\321\213\320\274-2026-08-13.md" |  55 +++
 ...\320\275\320\270\321\217\321\205-2026-08-13.md" |  37 ++
 .../Http/Controllers/Api/AnalyticsController.php   |  90 ++--
 .../app/Http/Controllers/Api/DbController.php      | 456 ++++++++++++++++++---
 .../Controllers/Api/EmployeeReadController.php     | 145 +++++++
 .../app/Http/Controllers/Api/ProfileController.php | 184 +++++++--
 .../app/Http/Middleware/AppVersionHeader.php       |  29 ++
 .../app/Http/Middleware/MemoryWatchdog.php         |  39 +-
 backend-laravel/app/Models/User.php                |  31 ++
 .../app/Providers/AppServiceProvider.php           |   4 +
 backend-laravel/app/Support/AppVersion.php         |  54 +++
 backend-laravel/bootstrap/app.php                  |  33 +-
 backend-laravel/public/.user.ini                   |   2 +-
 backend-laravel/routes/api.php                     |  67 +++
 backend-laravel/tests/Feature/DbControllerTest.php |  36 ++
 .../tests/Feature/EmployeeReadControllerTest.php   |  67 +++
 .../tests/Feature/ProfileDirectoryTest.php         |  86 ++++
 src/hooks/useNotificationInbox.ts                  |  70 ++++
 src/hooks/useUnreadNotifications.ts                |  23 +-
 src/integrations/laravel/client.ts                 |   2 +
 src/lib/__tests__/hrdDirectory.test.ts             |  40 ++
 src/lib/analytics/tracker.ts                       |  34 +-
 src/lib/hrdDirectory.ts                            |  18 +
 src/lib/versionWatcher.ts                          |  76 ++++
 src/main.tsx                                       |   7 +
 src/pages/HRDDashboard.tsx                         |  60 +--
 src/pages/UsersManagement.tsx                      |  39 +-
 src/pages/employee/EmployeeToday.tsx               |  80 +---
 37 files changed, 2035 insertions(+), 316 deletions(-)
 create mode 100644 .lovable/plan.md
 create mode 100644 ".lovable/plan/500-\320\275\320\260-api-db-positions-\320\27                                                                                                             0-api-db-career-track-templates-\320\264\320\270\320\260\320\263-2026-08-13.md"
 create mode 100644 ".lovable/plan/\320\277\320\276\321\207\320\265\320\274\321\                                                                                                             203-\320\275\320\270\321\207\320\265\320\263\320\276-\320\275\320\265-\320\274\3                                                                                                             20\265\320\275\321\217\320\265\321\202\321\201\321\217-\320\261\321\200\320\260\                                                                                                             321\203\320\267\320\265\321\200-\321\200\320\260\320\261\320\276\321\202\320\260                                                                                                             \320\265\321\202-\320\275\320\260-\321\201\321\202\320\260\321\200\320\276\320\2                                                                                                             74-\320\261\320\260\320\275\320\264\320\273\320\265-2026-08-13.md"
 create mode 100644 ".lovable/plan/\320\277\321\200\320\276\320\262\320\265\321\                                                                                                             200\320\272\320\260-\320\277\320\276\321\201\320\273\320\265-\320\262\321\213\32                                                                                                             0\272\320\260\321\202\320\260-\320\277\320\260\320\274\321\217\321\202\321\214-\                                                                                                             320\277\320\276\320\264\320\275\321\217\321\202\320\260-\321\207\321\202\320\276                                                                                                             -\320\264\320\260\320\273\321\214\321\210\320\265-2026-08-13.md"
 create mode 100644 ".lovable/plan/\321\200\320\260\320\267\320\262\321\221\321\                                                                                                             200\321\202\321\213\320\262\320\260\320\275\320\270\320\265-\320\270-\320\277\32                                                                                                             1\200\320\276\320\262\320\265\321\200\320\272\320\260-\321\204\320\270\320\272\3                                                                                                             21\201\320\260-500-\320\275\320\260-api-db-2026-08-13.md"
 create mode 100644 ".lovable/plan/\321\203\321\201\321\202\321\200\320\260\320\                                                                                                             275\320\265\320\275\320\270\320\265-\320\276\321\201\321\202\320\260\320\262\321                                                                                                             \210\320\270\321\205\321\201\321\217-500-\320\275\320\260-\321\215\320\272\321\2                                                                                                             00\320\260\320\275\320\265-\321\201\320\276\321\202\321\200\321\203\320\264\320\                                                                                                             275\320\270\320\272\320\260-today-2026-08-13.md"
 create mode 100644 ".lovable/plan/\321\203\321\201\321\202\321\200\320\260\320\                                                                                                             275\320\265\320\275\320\270\320\265-\320\277\320\276\320\262\321\202\320\276\321                                                                                                             \200\320\275\321\213\321\205-500-\320\262-\320\272\320\260\321\200\321\214\320\2                                                                                                             65\321\200\320\275\321\213\321\205-\321\202\321\200\320\265\320\272\320\260\321\                                                                                                             205-2026-08-13.md"
 create mode 100644 ".lovable/plan/\321\203\321\201\321\202\321\200\320\260\320\                                                                                                             275\320\270\321\202\321\214-500-\320\275\320\260-\320\277\321\200\320\276\321\20                                                                                                             4\320\270\320\273\321\217\321\205-\320\270-\320\264\320\276\320\273\320\266\320\                                                                                                             275\320\276\321\201\321\202\321\217\321\205-\321\201-\320\276\320\261\321\217\32                                                                                                             0\267\320\260\321\202\320\265\320\273\321\214\320\275\321\213\320\274-\320\261\3                                                                                                             20\276\320\265\320\262\321\213\320\274-2026-08-13.md"
 create mode 100644 ".lovable/plan/\321\203\321\201\321\202\321\200\320\260\320\                                                                                                             275\320\270\321\202\321\214-\320\277\320\276\320\262\321\202\320\276\321\200\320                                                                                                             \275\321\213\320\265-500-\320\275\320\260-\320\267\320\260\320\264\320\260\321\2                                                                                                             07\320\260\321\205-\320\270-\321\203\320\262\320\265\320\264\320\276\320\274\320                                                                                                             \273\320\265\320\275\320\270\321\217\321\205-2026-08-13.md"
 create mode 100644 backend-laravel/app/Http/Controllers/Api/EmployeeReadControl                                                                                                             ler.php
 create mode 100644 backend-laravel/app/Http/Middleware/AppVersionHeader.php
 create mode 100644 backend-laravel/app/Support/AppVersion.php
 create mode 100644 backend-laravel/tests/Feature/EmployeeReadControllerTest.php
 create mode 100644 backend-laravel/tests/Feature/ProfileDirectoryTest.php
 create mode 100644 src/hooks/useNotificationInbox.ts
 create mode 100644 src/lib/__tests__/hrdDirectory.test.ts
 create mode 100644 src/lib/hrdDirectory.ts
 create mode 100644 src/lib/versionWatcher.ts
[gro7659365@gro7659365 backend]$ composer install --no-dev --optimize-autoloader
Installing dependencies from lock file
Verifying lock file contents can be installed on current platform.
Package operations: 0 installs, 0 updates, 35 removals
  - Removing theseer/tokenizer (1.3.1)
  - Removing symfony/yaml (v7.4.15)
  - Removing staabm/side-effects-detector (1.0.5)
  - Removing sebastian/version (5.0.2)
  - Removing sebastian/type (5.1.3)
  - Removing sebastian/recursion-context (6.0.3)
  - Removing sebastian/object-reflector (4.0.1)
  - Removing sebastian/object-enumerator (6.0.1)
  - Removing sebastian/lines-of-code (3.0.1)
  - Removing sebastian/global-state (7.0.2)
  - Removing sebastian/exporter (6.3.2)
  - Removing sebastian/environment (7.2.1)
  - Removing sebastian/diff (6.0.2)
  - Removing sebastian/complexity (4.0.1)
  - Removing sebastian/comparator (6.3.3)
  - Removing sebastian/code-unit-reverse-lookup (4.0.1)
  - Removing sebastian/code-unit (3.0.3)
  - Removing sebastian/cli-parser (3.0.2)
  - Removing phpunit/phpunit (11.5.56)
  - Removing phpunit/php-timer (7.0.1)
  - Removing phpunit/php-text-template (4.0.1)
  - Removing phpunit/php-invoker (5.0.1)
  - Removing phpunit/php-file-iterator (5.1.1)
  - Removing phpunit/php-code-coverage (11.0.12)
  - Removing phar-io/version (3.2.1)
  - Removing phar-io/manifest (2.0.4)
  - Removing nunomaduro/collision (v8.9.5)
  - Removing myclabs/deep-copy (1.14.0)
  - Removing mockery/mockery (1.6.12)
  - Removing laravel/sail (v1.66.0)
  - Removing laravel/pint (v1.30.4)
  - Removing laravel/pail (v1.2.7)
  - Removing hamcrest/hamcrest-php (v2.1.1)
  - Removing filp/whoops (2.18.4)
  - Removing fakerphp/faker (v1.24.1)
Generating optimized autoload files
> Illuminate\Foundation\ComposerScripts::postAutoloadDump
> @php artisan package:discover --ansi

   INFO  Discovering packages.

  laravel/sanctum ....................................................... DONE
  laravel/socialite ..................................................... DONE
  laravel/tinker ........................................................ DONE
  nesbot/carbon ......................................................... DONE
  nunomaduro/termwind ................................................... DONE
  spatie/laravel-permission ............................................. DONE

55 packages you are using are looking for funding.
Use the `composer fund` command to find out more!
[gro7659365@gro7659365 backend]$ php artisan migrate --force

   INFO  Nothing to migrate.

[gro7659365@gro7659365 backend]$ php artisan config:clear

   INFO  Configuration cache cleared successfully.

[gro7659365@gro7659365 backend]$ php artisan cache:clear

   INFO  Application cache cleared successfully.

[gro7659365@gro7659365 backend]$ php artisan view:clear

   INFO  Compiled views cleared successfully.

[gro7659365@gro7659365 backend]$ php artisan route:clear

   INFO  Route cache cleared successfully.

```

## Критерий успеха

- `/api/health` возвращает актуальный `version`.
- `/api/profiles?per_page=200` и `/api/db/positions` отдают 200 для HRD-учетки.
- Время ответа обоих endpoint'ов менее 3 секунд.

## Следующий шаг после деплоя

Если 500 сохранятся на актуальной версии backend — провести новое расследование уже на свежем коде, а не на устаревшем `096f235`.