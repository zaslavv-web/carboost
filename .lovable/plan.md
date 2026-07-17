## Диагноз (проверено в коде)

В `RpcController::bulkInviteEmployees` (`backend-laravel/app/Http/Controllers/Api/RpcController.php`, стр. 164–275) при приглашении сотрудника:

1. Создаётся запись в `employee_invitations` c токеном.
2. Возвращается `{ created, skipped, errors }`.
3. **Никакой Mailable/Notification не отправляется** — почта не уходит вообще.

Фронт видит `created > 0` и показывает «приглашение отправлено», но фактически письма нет. Существующие `DemoRequestSubmitted` / `PricingInquirySubmitted` работают через `notifySales()` + `EmailConfigService`, для приглашений аналога нет.

## Что сделать (бэк)

1. Создать `app/Mail/EmployeeInvited.php` (Mailable, `ShouldQueue`-опционально, но по аналогии с sales-письмами — синхронно с try/catch, чтобы ошибка почты не ломала API-ответ). В письмо передать:
  - имя приглашающего и название компании;
  - опционально ФИО/должность;
  - ссылку вида `{APP_URL}/complete-registration?token={raw_token}&email={email}`;
  - срок действия (если задан).
2. Создать шаблон `resources/views/emails/employee_invited.blade.php` (простая брендированная вёрстка «Пик Роста» (если у компании нет своего фирменного оформления. Если есть - наследовать из него, кнопка-ссылка, plaintext-фоллбек).
3. В `bulkInviteEmployees` после успешного `insert` собирать список отправок и после `DB::transaction` — для каждого приглашения вызывать общий приватный метод `sendInvitationMail($row, $rawToken, $actor)`, реализованный по образцу `notifySales()`:
  - `EmailConfigService::autoRepairActiveSettings()` + `apply()`;
  - `Mail::to($email)->send(new EmployeeInvited(...))`;
  - при провале — `applyRuntimeEnv()` retry;
  - при финальной ошибке — писать её в `errors[]` ответа и в лог, `created` не откатывать (запись есть, ссылку можно «переотправить»).
4. Добавить в ответ `bulkInviteEmployees` поле `mailed` (сколько писем реально отправлено), чтобы фронт мог различать «создано» и «отправлено».
5. Добавить RPC `resend_invitation` (`{invitation_id}`) — берёт запись, генерирует новую пару token/token_hash, обновляет `updated_at`, шлёт письмо тем же путём. Роуты и allowlist уже есть в `RpcController::MUTATIONS`.
6. Проверить `config('mail.from.address')` и `APP_URL` в `.env` продакшена (документировать в ответе, что должны быть выставлены на `growth-peak.pro`).

## Что сделать (фронт, минимально)

1. `src/pages/Invitations.tsx` (или компонент, показывающий тост после bulk-invite): использовать новое поле `mailed` — показывать «Создано N, отправлено писем M, ошибок K». Если `mailed < created` — тост-предупреждение «часть писем не ушла, попробуйте «Отправить повторно»».
2. В таблице приглашений — кнопка «Отправить повторно» на записях со `status='pending'`, вызывает `resend_invitation`.

## Технические детали

- Не трогаем `EmailConfigService`, `AppServiceProvider::mail.extend('unisender_go')` и Transport — используем существующий стек.
- Токен: в БД хранится `token_hash = sha256(token)`, письмо содержит raw `token` (он уже возвращается локально в `bulkInviteEmployees` — надо аккуратно пробрасывать до `sendInvitationMail`, наружу в API не отдавать).
- Ошибки почты идут в `errors[]` с `row/email/error`, HTTP 200 сохраняется.
- Логи: `Log::info('Invitation mail sent', ...)`, `Log::error('Invitation mail failed', ...)` — далее видны в `storage/logs/laravel.log`.

## Проверка после деплоя

```
git pull
php artisan optimize:clear
```

UI: HRD → «Добавить нового сотрудника» → пригласить один тестовый email → проверить `laravel.log` (строка `Invitation mail sent`) и почтовый ящик получателя. Если письма нет — прислать хвост `storage/logs/laravel.log`.