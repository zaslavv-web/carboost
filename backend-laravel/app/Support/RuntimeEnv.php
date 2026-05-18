<?php

namespace App\Support;

/**
 * Runtime-safe access to deployment variables.
 *
 * На части боевых серверов Laravel config:cache остаётся со старым пустым
 * конфигом, а env() после кеширования не видит .env. Этот helper сначала
 * читает реальные переменные процесса, затем сам .env-файл рядом с app.
 */
class RuntimeEnv
{
    private static ?array $fileEnv = null;

    public static function get(string $key, ?string $fallback = null): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? null;
        if ($value === null || $value === '') {
            $processValue = getenv($key);
            $value = $processValue !== false ? $processValue : null;
        }
        if ($value === null || $value === '') {
            $value = self::fileEnv()[$key] ?? $fallback;
        }
        if (! is_string($value)) {
            return $fallback;
        }

        $value = trim($value);
        return $value !== '' ? $value : $fallback;
    }

    public static function status(string $key): string
    {
        return self::get($key) ? 'set' : 'missing';
    }

    public static function url(string $key, ?string $fallback = null): string
    {
        return self::absoluteUrl((string) (self::get($key, $fallback) ?? ''));
    }

    public static function absoluteUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return $url;
        }

        $normalized = preg_match('/^https?:\/\//i', $url)
            ? rtrim($url, '/')
            : 'https://' . ltrim(rtrim($url, '/'), '/');

        return preg_replace('#/api/auth/google/callbac$#', '/api/auth/google/callback', $normalized) ?: $normalized;
    }

    public static function fileEnv(): array
    {
        if (self::$fileEnv !== null) {
            return self::$fileEnv;
        }

        $path = base_path('.env');
        if (! is_readable($path)) {
            return self::$fileEnv = [];
        }

        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $values[trim($key)] = trim(trim($value), "\"'");
        }

        return self::$fileEnv = $values;
    }
}