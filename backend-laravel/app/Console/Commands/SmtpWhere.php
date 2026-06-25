<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Показывает, какой именно .env реально читает Laravel.
 *   php artisan smtp:where
 */
class SmtpWhere extends Command
{
    protected $signature = 'smtp:where';
    protected $description = 'Показать пути base_path / .env и метаданные файла (без значений)';

    public function handle(): int
    {
        $basePath = base_path();
        $envPath = app()->environmentFilePath();
        $envReal = is_file($envPath) ? (realpath($envPath) ?: $envPath) : null;

        $this->line('');
        $this->info('=== SMTP WHERE ===');
        $this->line('PHP binary       : ' . (defined('PHP_BINARY') ? PHP_BINARY : '(unknown)'));
        $this->line('php_sapi_name    : ' . php_sapi_name());
        $this->line('getcwd()         : ' . (getcwd() ?: '(unknown)'));
        $this->line('base_path()      : ' . $basePath);
        $this->line('environmentFile  : ' . $envPath);
        $this->line('realpath(.env)   : ' . ($envReal ?: '(файл не найден)'));

        if ($envReal && is_file($envReal)) {
            $stat = @stat($envReal);
            $size = $stat['size'] ?? 0;
            $mtime = isset($stat['mtime']) ? date('Y-m-d H:i:s', $stat['mtime']) : '?';
            $perms = isset($stat['mode']) ? substr(sprintf('%o', $stat['mode']), -4) : '?';
            $owner = function_exists('posix_getpwuid') && isset($stat['uid'])
                ? (posix_getpwuid($stat['uid'])['name'] ?? $stat['uid'])
                : ($stat['uid'] ?? '?');

            $this->line('');
            $this->line('--- .env метаданные ---');
            $this->line("size  : {$size} байт");
            $this->line("mtime : {$mtime}");
            $this->line("perms : {$perms}");
            $this->line("owner : {$owner}");

            $raw = @file_get_contents($envReal) ?: '';
            $lines = preg_split('/\r\n|\r|\n/', $raw);
            $hits = ['MAIL_PASSWORD' => [], 'SMTP_PASSWORD' => []];
            foreach ($lines as $i => $line) {
                foreach (array_keys($hits) as $key) {
                    if (preg_match('/^\s*(export\s+)?' . preg_quote($key, '/') . '\s*=/', $line)) {
                        $hits[$key][] = $i + 1;
                    }
                }
            }
            $this->line('');
            $this->line('--- ключи (только номера строк) ---');
            foreach ($hits as $key => $lineNums) {
                $count = count($lineNums);
                $where = $count ? ('строки: ' . implode(', ', $lineNums)) : '—';
                $this->line(sprintf('%-15s : %d совпадений (%s)', $key, $count, $where));
            }
        }

        $this->line('');
        $this->line('Подсказка: если environmentFile не равен ожидаемому backend-laravel/.env —');
        $this->line('artisan запускается из другой Laravel-копии. Запускайте: cd backend-laravel && php artisan ...');
        $this->line('');

        return self::SUCCESS;
    }
}
