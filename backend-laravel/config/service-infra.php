<?php

/**
 * Централизованный репозиторий стабильных инфраструктурных настроек сервиса.
 *
 * Сюда складывается всё, что:
 *   - редко меняется,
 *   - одинаково на проде,
 *   - не должно редактироваться через UI обычным админом.
 *
 * Секреты остаются в .env (через env() здесь и далее).
 *
 * Иерархия источников SMTP:
 *   1. Активная запись в БД (email_settings) — управляется суперадмином через UI.
 *   2. smtp_defaults ниже — fallback, если БД пустая/битая.
 *   3. .env (MAIL_*) — legacy fallback третьего уровня.
 *
 * Для Google OAuth / AI gateway / monitor inbox / frontend URL — источник всегда этот файл.
 */
return [
    'smtp_defaults' => [
        'provider'     => 'yandex',
        'host'         => 'smtp.yandex.ru',
        'port'         => 465,
        'encryption'   => 'ssl',
        'username'     => 'growthpeak@yandex.ru',
        'password'     => env('SMTP_PASSWORD'),
        'from_address' => 'growthpeak@yandex.ru',
        'from_name'    => 'Пик Роста',
    ],

    'mail_monitor' => [
        'inbox'              => 'growthpeak@yandex.ru',
        'bcc_critical'       => true,
        'heartbeat_enabled'  => true,
        'heartbeat_time'     => '08:00',
        'heartbeat_timezone' => 'Europe/Moscow',
    ],

    'google_oauth' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect_uri'  => 'https://growth-peak.pro/api/auth/google/callback',
    ],

    'sso' => [
        // Заготовка под будущие SSO-провайдеры.
    ],

    'ai_gateway' => [
        'url'     => env('AI_API_URL', 'https://api.openai.com/v1/chat/completions'),
        'model'   => env('AI_MODEL', 'gpt-4o-mini'),
        'api_key' => env('AI_API_KEY', env('LOVABLE_API_KEY')),
    ],

    'frontend' => [
        'url' => 'https://growth-peak.pro',
    ],
];
