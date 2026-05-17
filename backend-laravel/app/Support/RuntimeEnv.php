<?php

namespace App\Support;

/**
 * Runtime-safe access to .env values.
 *
 * На боевом сервере Laravel config cache может быть собран до обновления .env.
 * В таком случае env() и config() возвращают старые/пустые значения. Этот helper
 * читает .env напрямую и применяет критичные настройки перед OAuth/SMTP-вызовами.
 */
final class RuntimeEnv
{
    private static ?array $values = null;

    public static function get(string $key, mixed $fallback = null): mixed
    {
        $serverValue = $_SERVER[$key] ?? $_ENV[$key] ?? getenv($key);
        if ($serverValue !== false && $serverValue !== null && $serverValue !== '') {
            return $serverValue;
        }

        $values = self::values();
        return array_key_exists($key, $values) && $values[$key] !== ''
            ? $values[$key]
            : $fallback;
    }

    public static function applyGoogleConfig(): array
    {
        $appUrl = rtrim((string) self::get('APP_URL', config('app.url')), '/');
        $config = [
            'client_id'     => self::get('GOOGLE_CLIENT_ID', config('services.google.client_id')),
            'client_secret' => self::get('GOOGLE_CLIENT_SECRET', config('services.google.client_secret')),
            'redirect'      => self::get('GOOGLE_REDIRECT_URI', config('services.google.redirect', $appUrl . '/api/auth/google/callback')),
        ];

        config(['services.google' => $config]);
        return $config;
    }

    public static function applyMailConfig(): void
    {
        $mailer = (string) self::get('MAIL_MAILER', config('mail.default', 'smtp'));
        config(['mail.default' => $mailer]);

        if ($mailer === 'smtp') {
            config([
                'mail.mailers.smtp.transport'  => 'smtp',
                'mail.mailers.smtp.host'       => self::get('MAIL_HOST', config('mail.mailers.smtp.host')),
                'mail.mailers.smtp.port'       => (int) self::get('MAIL_PORT', config('mail.mailers.smtp.port', 587)),
                'mail.mailers.smtp.encryption' => self::get('MAIL_ENCRYPTION', config('mail.mailers.smtp.encryption')),
                'mail.mailers.smtp.username'   => self::get('MAIL_USERNAME', config('mail.mailers.smtp.username')),
                'mail.mailers.smtp.password'   => self::get('MAIL_PASSWORD', config('mail.mailers.smtp.password')),
            ]);
        }

        config([
            'mail.from.address' => self::get('MAIL_FROM_ADDRESS', config('mail.from.address')),
            'mail.from.name'    => self::get('MAIL_FROM_NAME', config('mail.from.name', config('app.name'))),
        ]);

        if (app()->bound('mail.manager') && method_exists(app('mail.manager'), 'forgetMailers')) {
            app('mail.manager')->forgetMailers();
        }
    }

    public static function frontendUrl(): string
    {
        return rtrim((string) self::get('FRONTEND_URL', self::get('APP_FRONTEND_URL', config('app.url'))), '/');
    }

    private static function values(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }

        self::$values = [];
        foreach ([base_path('.env'), base_path('.env.production')] as $path) {
            if (!is_file($path) || !is_readable($path)) {
                continue;
            }

            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                    continue;
                }

                [$key, $value] = explode('=', $line, 2);
                $key = trim($key);
                $value = trim($value);

                if ($key === '') {
                    continue;
                }

                if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
                    $value = substr($value, 1, -1);
                }

                self::$values[$key] = str_replace(['\\n', '\\"'], ["\n", '"'], $value);
            }
        }

        return self::$values;
    }
}