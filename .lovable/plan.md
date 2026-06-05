# Fix: Composer install blocked by security advisories on Laravel 11.x

## Что происходит

На сервере `composer install` падает:

```
Root composer.json requires laravel/framework ^11.31, found laravel/framework
[v11.31.0 ... v11.54.0] but these were not loaded, because they are affected
by security advisories (PKSA-mdq4-51ck-6kdq, PKSA-8qx3-n5y5-vvnd,
PKSA-q46n-4fdk-zjr4, PKSA-qzrn-rnz3-85w1).
```

Composer 2.8+ по умолчанию **отказывается ставить** пакеты, у которых есть незакрытые advisories. Все доступные версии Laravel 11 (включая последнюю 11.54.0) сейчас помечены этими advisory-ID, патч-релиза ещё нет → ни одна версия не проходит фильтр, установка останавливается.

В нашем репо `composer.json` лежит **не в git** (Laravel создаётся через `composer create-project` прямо на сервере, см. `backend-laravel/README.md`), поэтому править его «в коде» бессмысленно — он перезапишется. Единственное место, через которое мы можем гарантированно повлиять на сервер, — `deploy/deploy-laravel.sh`.

## План

Поправить **только** `deploy/deploy-laravel.sh`, добавив перед `composer install` принудительное отключение advisory-блокера и audit-шума:

1. Перед шагом `composer install` выставить:
   - `composer config --global --no-plugins policy.advisories.block false` — глобально снимает блокировку установки из-за advisories (сами warnings остаются, но `install` уже не падает).
   - `export COMPOSER_NO_AUDIT=1` — выключает финальный `composer audit`, чтобы он не валил скрипт ненулевым кодом.
2. Запускать `composer install` с `--no-audit` (на старых композерах флаг безвреден).
3. В лог писать предупреждение «advisories.block отключён вручную из-за открытых CVE на laravel/framework 11.x — обновить до патч-релиза, как только он выйдет».
4. После успешного `install` — оставить как есть; `route:cache`, `migrate` и т.д. не меняем.

Никакие другие файлы (`composer.json`, `routes/api.php`, фронт) не трогаем.

## Что должен сделать пользователь

1. Дождаться, пока обновлённый `deploy-laravel.sh` попадёт на сервер (или вручную: `scp deploy/deploy-laravel.sh server:/var/www/api/deploy/`).
2. Запустить:
   ```bash
   sudo -u www-data bash /var/www/api/deploy/deploy-laravel.sh
   ```
3. Прислать последние ~50 строк `/var/log/laravel-deploy.log` — убедиться, что `composer install` прошёл и `php artisan route:list --path=admin/users` показывает маршрут `PATCH api/admin/users/{userId}/company`.

## Дальнейший trade-off

Это временный обход. Как только Laravel выпустит патч-релиз 11.x с закрытием PKSA-mdq4-51ck-6kdq и остальных трёх — нужно убрать `policy.advisories.block false` обратно. Альтернатива «прямо сейчас» — миграция на Laravel 12, что выходит за рамки задачи и потребует отдельного плана.
