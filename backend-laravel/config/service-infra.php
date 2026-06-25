<?php

/**
 * Централизованный репозиторий стабильных инфраструктурных настроек сервиса.
 *
 * ВАЖНО: SMTP, frontend URL и Google OAuth теперь читаются ИСКЛЮЧИТЕЛЬНО из .env.
 * Этот файл оставлен как тонкая обёртка над env() для обратной совместимости —
 * чтобы любые места, которые исторически читали ServiceInfra::smtpDefaults() и т.п.,
 * автоматически получали актуальные значения из .env, без захардкоженных дефолтов.
 *
 * Единственный источник правды для учётных данных — .env.
 */
return [
    'smtp_defaults' => [
        'provider'     => env('MAIL_PROVIDER', 'custom'),
        'host'         => env('MAIL_HOST'),
        'port'         => env('MAIL_PORT', 587),
        'encryption'   => env('MAIL_ENCRYPTION'),
        'username'     => env('MAIL_USERNAME'),
        // SMTP_PASSWORD сохранён как алиас для обратной совместимости со старыми .env.
        'password'     => env('MAIL_PASSWORD', env('SMTP_PASSWORD')),
        'from_address' => env('MAIL_FROM_ADDRESS'),
        'from_name'    => env('MAIL_FROM_NAME', env('APP_NAME', 'Career Track')),
    ],

    'mail_monitor' => [
        'inbox'              => env('SALES_NOTIFICATION_EMAIL', env('MAIL_FROM_ADDRESS')),
        'bcc_critical'       => env('MAIL_MONITOR_BCC_CRITICAL', true),
        'heartbeat_enabled'  => env('MAIL_HEARTBEAT_ENABLED', true),
        'heartbeat_time'     => env('MAIL_HEARTBEAT_TIME', '08:00'),
        'heartbeat_timezone' => env('MAIL_HEARTBEAT_TIMEZONE', 'Europe/Moscow'),
    ],

    'google_oauth' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect_uri'  => env('GOOGLE_REDIRECT_URI'),
    ],

    'sso' => [
        // Заготовка под будущие SSO-провайдеры.
    ],

    'ai_gateway' => [
        'url'     => env('AI_API_URL', 'https://api.openai.com/v1/chat/completions'),
        'model'   => env('AI_MODEL', 'gpt-4o-mini'),
        'api_key' => env('AI_API_KEY'),
    ],

    'frontend' => [
        'url' => env('FRONTEND_URL', env('APP_URL', '')),
    ],
];
