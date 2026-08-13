<?php

namespace App\Support;

/**
 * Маркер версии выката. VERSION пишет CI; при ручном `git pull` файла нет —
 * тогда берём хэш HEAD из .git. Нужен, чтобы одним взглядом отличить
 * «код не выкатился» от «код выкатился, но падает».
 */
class AppVersion
{
    protected static ?string $cached = null;

    public static function current(): string
    {
        if (self::$cached !== null) {
            return self::$cached;
        }

        $version = trim((string) @file_get_contents(base_path('VERSION')));
        if ($version === '') {
            $version = self::fromGit();
        }

        return self::$cached = ($version !== '' ? $version : 'unknown');
    }

    protected static function fromGit(): string
    {
        try {
            $head = @file_get_contents(base_path('.git/HEAD'));
            if (! $head) {
                return 'unknown';
            }

            $sha = $head;
            if (preg_match('/^ref:\s*(\S+)/', $head, $m)) {
                $sha = @file_get_contents(base_path('.git/' . $m[1]));
                if (! $sha) {
                    $packed = @file_get_contents(base_path('.git/packed-refs')) ?: '';
                    if (preg_match('/^([0-9a-f]{40})\s+' . preg_quote($m[1], '/') . '$/m', $packed, $p)) {
                        $sha = $p[1];
                    }
                }
            }

            $sha = trim((string) $sha);

            return $sha !== '' ? substr($sha, 0, 7) : 'unknown';
        } catch (\Throwable $e) {
            return 'unknown';
        }
    }
}
