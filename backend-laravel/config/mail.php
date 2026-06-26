<?php

return [
    'default' => env('MAIL_MAILER', 'log'),

    'mailers' => [
        'smtp' => [
            'transport' => 'smtp',
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 2525),
            'encryption' => env('MAIL_ENCRYPTION', null),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => null,
            'local_domain' => env('MAIL_EHLO_DOMAIN'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'unisender_go' => [
            'transport' => 'unisender_go',
            'key'       => env('UNISENDER_GO_API_KEY'),
            'endpoint'  => env('UNISENDER_GO_ENDPOINT', 'https://go2.unisender.ru/ru/transactional/api/v1/email/send.json'),
            'timeout'   => (int) env('UNISENDER_GO_TIMEOUT', 15),
        ],
    ],


    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
        'name' => env('MAIL_FROM_NAME', 'Career Track'),
    ],

    // Получатель уведомлений с публичных форм лендинга (демо, тарифы).
    'sales_recipient' => env('SALES_NOTIFICATION_EMAIL', env('MAIL_FROM_ADDRESS', 'growthpeak@yandex.ru')),
];
