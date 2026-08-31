<?php

/**
 * CORS для Laravel API.
 *
 * Bearer-токены Sanctum хранятся в localStorage → cookies не нужны,
 * `supports_credentials = false`, allowed_origins можно ограничить
 * списком доменов (прод + Lovable preview).
 */
return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        'https://growth-peak.pro',
        'https://www.growth-peak.pro',
        'https://carboost.lovable.app',
        // Интеграционные консоли. При штатной раскладке (поддомены смотрят в тот
        // же докрут) запросы идут same-origin и CORS не нужен; записи здесь —
        // страховка на случай отдельного докрута или своего хостинга консолей.
        'https://api-out.growth-peak.pro',
        'https://api-in.growth-peak.pro',
    ],

    'allowed_origins_patterns' => [
        // Lovable preview/sandbox домены
        '#^https://[a-z0-9-]+\.lovableproject\.com$#i',
        '#^https://[a-z0-9-]+\.lovable\.app$#i',
        '#^https://id-preview--[a-z0-9-]+\.lovable\.app$#i',
        // Локальная разработка
        '#^http://localhost(:\d+)?$#',
        '#^http://127\.0\.0\.1(:\d+)?$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => false,
];
