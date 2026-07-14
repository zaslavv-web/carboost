## Проблема

`git pull` на проде упал: локальные изменения в `README.md` конфликтуют с апстримом. Это не проблема кода Lovable — это состояние вашего сервера. Решается одной командой на сервере, я в проекте ничего менять не должен.

## Что сделать на сервере (в каталоге `backend`)

Вариант A — если локальные правки README не нужны (99% случаев, README у нас никто не редактирует руками):

```bash
git checkout -- README.md
git pull
```

Вариант B — если правки README нужно сохранить:

```bash
git stash push -m "local readme" README.md
git pull
git stash pop        # вернуть правки поверх; при конфликте — разрулить вручную
```

Вариант C — жёстко подтянуть точное состояние origin/main (снесёт ВСЕ локальные изменения в рабочем дереве, не только README):

```bash
git fetch origin
git reset --hard origin/main
```

Рекомендую **Вариант A**.

## После успешного pull — доделать деплой

```bash
composer install --no-dev -o
php artisan migrate --force
[gro7659365@gro7659365 backend]$ php artisan migrate --force

   INFO  Nothing to migrate.

php artisan config:cache && php artisan route:cache

[gro7659365@gro7659365 backend]$ php artisan config:cache && php artisan route:cache

   INFO  Configuration cached successfully.


   INFO  Routes cached successfully.


php artisan queue:restart

[gro7659365@gro7659365 backend]$ php artisan queue:restart

   INFO  Broadcasting queue restart signal.

```

## Дальше

Напишите «задеплоено» после того, как миграции пройдут — я прогоню оставшуюся часть E2E-сценария за HRD (импорт сотрудников через `bulk_invite_employees`, создание HR-документа, карьерного трека, чаты) и пришлю отчёт.

Никаких правок в репозитории от меня по этой задаче не требуется — план на подтверждение носит информационный характер (в plan mode я не могу выполнить команды на вашем сервере).