## Что происходит

`.env` на VPS откатывается не сам по себе: его перезаписывает GitHub Actions workflow `.github/workflows/npm-publish.yml` при деплое.

В workflow есть шаг **Create backend .env**, который каждый раз генерирует новый `backend/.env`, а затем через `rsync --delete` отправляет его на сервер. В этом генераторе сейчас зашиты/подставляются старые значения:

- `MAIL_MAILER`: жёстко задан как `smtp`
- `MAIL_FROM_ADDRESS`: берётся из GitHub Secret `MAIL_FROM_ADDRESS`, а если там старое значение — возвращается `growthpeak@yandex.ru`
- `UNISENDER_GO_API_KEY` и `UNISENDER_GO_ENDPOINT` не попадают в генерируемый `.env`
- вручную исправленные значения на VPS не сохраняются, кроме `APP_KEY`

## План исправления

1. Обновить `.github/workflows/npm-publish.yml`:
  - убрать хардкод `MAIL_MAILER=smtp`;
  - добавить поддержку `MAIL_MAILER=unisender_go`;
  - добавить переменные `UNISENDER_GO_API_KEY`, `UNISENDER_GO_ENDPOINT`, `UNISENDER_GO_TIMEOUT`;
  - сделать preserve-логику для почтового блока: если на сервере уже есть корректные `MAIL_*` / `UNISENDER_GO_*`, workflow будет сохранять их, а не затирать.
2. Добавить безопасные fallback-значения:
  - `MAIL_MAILER` по умолчанию `unisender_go`, если в GitHub Secrets/Vars не задано другое;
  - `UNISENDER_GO_ENDPOINT` по умолчанию `https://go2.unisender.ru/ru/transactional/api/v1/email/send.json`;
  - `MAIL_FROM_ADDRESS` не должен автоматически возвращаться к `growthpeak@yandex.ru`.
3. Оставить совместимость с SMTP:
  - если когда-нибудь понадобится вернуться на SMTP, это можно будет сделать через GitHub Variables/Secrets, без правки кода workflow.
4. После правки нужно будет на VPS один раз выставить правильный `.env` или обновить GitHub Secrets/Variables:
  - `MAIL_MAILER=unisender_go`
  - `MAIL_FROM_ADDRESS` = адрес на подтверждённом домене Unisender
  - `UNISENDER_GO_API_KEY`
  - `UNISENDER_GO_ENDPOINT=https://go2.unisender.ru/ru/transactional/api/v1/email/send.json`

## Проверка после внедрения

После следующего деплоя выполнить на VPS:

```bash
cd ~/growth-peak.pro/docs/backend
php artisan config:clear
php artisan cache:clear
php artisan smtp:status
php artisan unisender:test zaslavv@gmail.com
```

Ожидаемо:

- `Активный канал: unisender_go`
- `From` больше не откатывается на `growthpeak@yandex.ru`
- `.env` больше не возвращается к старой версии после деплоя

а настройки на сервере не слетят?

&nbsp;