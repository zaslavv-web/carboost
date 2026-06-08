
# План: централизация инфраструктурных настроек + мониторинг почты

## Ключевое ограничение

**Бизнес-логика редактирования SMTP через админку `EmailSettingsManagement` НЕ ломается.** Суперадмин по-прежнему может через UI поменять host/port/login/пароль, нажать «Проверить» и «Активировать». Файл-репозиторий становится **fallback и источником для нередактируемых данных** (Google OAuth redirect, AI gateway URL, монитор-инбокс, frontend URL).

---

## Иерархия источников (новая)

Для SMTP:
```text
1. Активная запись в email_settings (через админку)   ← приоритет, поведение как сейчас
2. config/service-infra.php (дефолты Яндекса из env.txt) ← если БД пустая/битая
3. .env (legacy MAIL_*)                                 ← третий уровень fallback
4. log-mailer                                           ← последний рубеж
```

Для Google OAuth / AI / frontend URL / monitor inbox: всегда из `service-infra.php` (в админке не редактируется).

---

## Часть 1. Файл `backend-laravel/config/service-infra.php`

Стабильные данные сервиса. Корректные дефолты Яндекса берутся из приложенного env.txt:

```text
return [
  'smtp_defaults' => [
    'provider'     => 'yandex',
    'host'         => 'smtp.yandex.ru',
    'port'         => 465,
    'encryption'   => 'ssl',
    'username'     => 'growthpeak@yandex.ru',
    'password'     => env('SMTP_PASSWORD'),   // секрет — только в .env
    'from_address' => 'growthpeak@yandex.ru',
    'from_name'    => 'Пик Роста',
  ],
  'mail_monitor' => [
    'inbox'              => 'growthpeak@yandex.ru',
    'bcc_critical'       => true,
    'heartbeat_enabled'  => true,
    'heartbeat_time'     => '08:00',           // Europe/Moscow
  ],
  'google_oauth' => [
    'client_id'    => env('GOOGLE_CLIENT_ID'),
    'client_secret'=> env('GOOGLE_CLIENT_SECRET'),
    'redirect_uri' => 'https://growth-peak.pro/api/auth/google/callback',
  ],
  'sso' => [ /* заготовка под будущие провайдеры */ ],
  'ai_gateway' => [
    'url'     => env('AI_API_URL', 'https://api.openai.com/v1/chat/completions'),
    'model'   => env('AI_MODEL', 'gpt-4o-mini'),
    'api_key' => env('AI_API_KEY'),
  ],
  'frontend' => [
    'url' => 'https://growth-peak.pro',
  ],
];
```

Принцип: в файле — то, что редко меняется и одинаково на проде. Секреты остаются в `.env`. Изменяемое суперадмином SMTP — в БД.

## Часть 2. Helper `app/Support/ServiceInfra.php`

Единая точка доступа: `smtpDefaults()`, `google()`, `ai()`, `frontendUrl()`, `monitorInbox()`, `shouldBccCritical()`, `heartbeatEnabled()`, `heartbeatTime()`.

## Часть 3. EmailConfigService — добавляется fallback

В `EmailConfigService::apply()`:
1. Если `active()` вернул валидную запись с паролем → применяем как сейчас (БД-приоритет). **Логика админки не меняется.**
2. Если нет / битая → новый `applyFileDefaults()` берёт `ServiceInfra::smtpDefaults()` и пишет в `config('mail.*')`, лог `info: smtp from file fallback`.
3. Если и в файле пароль пустой → текущий `applyRuntimeEnv()` как третий уровень.

Методы `update()`, `test()`, `preflight()`, `activate()`, `autoRepairActiveSettings()`, нормализаторы — **без изменений**. `EmailSettingsController`, `EmailSetting` model, миграции `email_settings`, страница `src/pages/EmailSettingsManagement.tsx` — **не трогаем**.

## Часть 4. Перевод сторонних сервисов на ServiceInfra

Только централизация чтения, без изменения логики:
- Google OAuth контроллер → `ServiceInfra::google()`
- `AiGatewayService` → `ServiceInfra::ai()`
- Места, читающие `FRONTEND_URL`/`APP_FRONTEND_URL` напрямую → `ServiceInfra::frontendUrl()`

## Часть 5. BCC критичных писем

Критичные = только auth: восстановление пароля, приглашения сотрудников, подтверждение регистрации.

- Новый листенер `app/Listeners/AttachMonitoringBcc.php` на `Illuminate\Mail\Events\MessageSending`.
- Срабатывает, если в Symfony Message есть заголовок `X-Critical: 1` и `ServiceInfra::shouldBccCritical()` true → добавляет BCC `ServiceInfra::monitorInbox()` (если адрес не совпадает с получателем).
- Регистрация в `AppServiceProvider::boot()`.
- В `ResetPasswordNotification::toMail()` и нотификациях приглашений добавляется одна строка:
  ```text
  ->withSymfonyMessage(fn($m) => $m->getHeaders()->addTextHeader('X-Critical','1'))
  ```
- Никаких массовых правок: нотификации без маркера идут без копии.

## Часть 6. Daily heartbeat

- Команда `app/Console/Commands/SendMailHeartbeat.php` (`mail:heartbeat`):
  - Subject `[Пик Роста] SMTP heartbeat YYYY-MM-DD`, тело: время, хост, источник SMTP (БД/файл/env).
  - `Mail::raw(...)` на `ServiceInfra::monitorInbox()`.
  - Любая ошибка → `Log::error('mail_heartbeat_failed', [...])`.
  - Если `heartbeatEnabled() === false` → тихий выход.
- Расписание в `routes/console.php`:
  `Schedule::command('mail:heartbeat')->dailyAt(ServiceInfra::heartbeatTime())->timezone('Europe/Moscow');`

Не пришло письмо в 08:00 → SMTP сломан, смотреть лог по тегу `mail_heartbeat_failed`.

## Часть 7. .env и совместимость

- В `.env` оставляем только секреты и окружение: `APP_KEY`, `DB_*`, `REDIS_*`, `SANCTUM_*`, `SESSION_DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AI_API_KEY`.
- Добавляем `SMTP_PASSWORD=wrtwpknhswvvsxhk` (пароль Яндекс-приложения для file-fallback).
- `MAIL_*` блок можно оставить (он становится 3-м уровнем fallback, ничего не ломает), но в `.env.production.example` он помечается «legacy / для совместимости».
- ⚠️ Пароль `wrtwpknhswvvsxhk` засвечен в чате — после стабилизации сгенерировать новый на https://id.yandex.ru/security/app-passwords и обновить.

## Файлы

**Создаются:**
- `backend-laravel/config/service-infra.php`
- `backend-laravel/app/Support/ServiceInfra.php`
- `backend-laravel/app/Listeners/AttachMonitoringBcc.php`
- `backend-laravel/app/Console/Commands/SendMailHeartbeat.php`

**Меняются (минимально и обратносовместимо):**
- `backend-laravel/app/Services/EmailConfigService.php` — добавлен `applyFileDefaults()` как fallback ветка в `apply()`
- `backend-laravel/app/Providers/AppServiceProvider.php` — регистрация листенера
- `backend-laravel/app/Notifications/ResetPasswordNotification.php` — маркер `X-Critical`
- нотификации приглашений сотрудников/подтверждения email — маркер `X-Critical`
- `backend-laravel/routes/console.php` — schedule для heartbeat
- Контроллер Google OAuth и `AiGatewayService` — чтение через `ServiceInfra`
- `backend-laravel/.env` / `.env.production.example` — добавлен `SMTP_PASSWORD`, комментарии об источниках

**НЕ трогаем:**
- `EmailSettingsController`, `EmailSetting` model, миграции `email_settings`
- `src/pages/EmailSettingsManagement.tsx`
- `config/mail.php`

## Чек-лист «ничего не сломалось»

- [ ] Админка открывает текущие настройки из БД и сохраняет изменения.
- [ ] Кнопки «Проверить SMTP» и «Активировать» работают как раньше.
- [ ] Восстановление пароля шлёт письмо пользователю + копию на growthpeak@yandex.ru.
- [ ] Если очистить `email_settings` — восстановление пароля всё равно работает (через файл с дефолтами Яндекса).
- [ ] В 08:00 по Москве приходит heartbeat-письмо.
- [ ] Логи без `mail_heartbeat_failed`.
