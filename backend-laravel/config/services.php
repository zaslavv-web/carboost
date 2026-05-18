<?php

/**
 * Переопределение config/services.php — только Google OAuth.
 * Остальное (mailgun, postmark и т.д.) берётся из дефолтного config файла Laravel.
 */
return [

    'google' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect'      => env('GOOGLE_REDIRECT_URI', rtrim(env('APP_URL', ''), '/') . '/api/auth/google/callback'),
    ],

];
