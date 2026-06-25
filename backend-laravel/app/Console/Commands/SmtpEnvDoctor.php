<?php

namespace App\Console\Commands;

use App\Support\RuntimeEnv;
use Illuminate\Console\Command;

/**
 * Диагностика .env: ищет проблемы с MAIL_PASSWORD / SMTP_PASSWORD,
 * не выводя сами значения. Запуск: php artisan smtp:env-doctor
 */
class SmtpEnvDoctor extends Command
{
    protected $signature = 'smtp:env-doctor {--path= : Путь к .env (по умолчанию base_path(.env))}';
    protected $description = 'Диагностика .env для MAIL_PASSWORD/SMTP_PASSWORD без вывода значений';

    public function handle(): int
    {
        $path = $this->option('path') ?: base_path('.env');

        if (!is_file($path)) {
            $this->error("Файл .env не найден: {$path}");
            return self::FAILURE;
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            $this->error("Не удалось прочитать файл: {$path}");
            return self::FAILURE;
        }

        $this->line('');
        $this->info('=== SMTP ENV DOCTOR ===');
        $this->line("Файл: {$path}");
        $this->line('Размер: ' . strlen($raw) . ' байт');

        // BOM
        if (substr($raw, 0, 3) === "\xEF\xBB\xBF") {
            $this->warn('⚠ В начале файла найден UTF-8 BOM — может ломать парсер. Удалите BOM (пересохраните без BOM).');
        }

        // CRLF
        if (strpos($raw, "\r\n") !== false) {
            $this->warn('⚠ Файл в формате CRLF (Windows). Обычно ок, но иногда мешает. Рекомендуется LF.');
        }

        $lines = preg_split('/\r\n|\r|\n/', $raw);
        $targets = ['MAIL_PASSWORD', 'SMTP_PASSWORD'];
        $found = [];

        foreach ($lines as $i => $line) {
            $trimmed = ltrim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }
            foreach ($targets as $key) {
                if (preg_match('/^\s*(export\s+)?' . preg_quote($key, '/') . '\s*=(.*)$/', $line, $m)) {
                    $found[$key][] = [
                        'line' => $i + 1,
                        'raw_value' => $m[2],
                    ];
                }
            }
        }

        foreach ($targets as $key) {
            $this->line('');
            $this->line("--- {$key} ---");
            if (empty($found[$key])) {
                $this->line('  (не найдено)');
                continue;
            }
            $count = count($found[$key]);
            if ($count > 1) {
                $this->warn("⚠ Найдено {$count} строк {$key}=. Победит ПОСЛЕДНЯЯ. Удалите дубликаты!");
            }
            foreach ($found[$key] as $entry) {
                $this->analyzeValue($key, $entry['line'], $entry['raw_value']);
            }
        }

        // Что увидел dotenv
        $this->line('');
        $this->line('--- Как видит парсер Laravel (dotenv) ---');
        foreach ($targets as $key) {
            $val = RuntimeEnv::get($key);
            $len = $val !== null ? strlen($val) : 0;
            $this->line("  {$key}: " . ($val ? "длина = {$len}" : '(пусто)'));
        }

        $this->line('');
        $this->info('Подсказка: корректный формат — MAIL_PASSWORD="abcdefghijklmnop" (16 латинских букв в двойных кавычках, без пробелов).');
        $this->line('');

        return self::SUCCESS;
    }

    private function analyzeValue(string $key, int $line, string $rawAfterEq): void
    {
        $rawLen = strlen($rawAfterEq);

        // Извлечь "видимое" значение по правилам dotenv (упрощённо)
        $val = $rawAfterEq;
        // снять inline-комментарий ТОЛЬКО если значение НЕ в кавычках
        $stripped = $val;
        $hasDoubleQuotes = false;
        $hasSingleQuotes = false;

        if (preg_match('/^\s*"((?:[^"\\\\]|\\\\.)*)"/', $val, $m)) {
            $hasDoubleQuotes = true;
            $parsed = $m[1];
        } elseif (preg_match("/^\\s*'([^']*)'/", $val, $m)) {
            $hasSingleQuotes = true;
            $parsed = $m[1];
        } else {
            // без кавычек: dotenv обрезает по пробелу / # / табу
            $tmp = ltrim($val);
            // обрезать по # (комментарий)
            $hashPos = strpos($tmp, '#');
            if ($hashPos !== false) {
                $tmp = substr($tmp, 0, $hashPos);
            }
            // обрезать по пробелу/табу
            if (preg_match('/^(\S*)/', $tmp, $m2)) {
                $parsed = $m2[1];
            } else {
                $parsed = $tmp;
            }
        }

        $valueOnly = trim($rawAfterEq);
        $flags = [
            'has_space'        => (bool) preg_match('/ /', $valueOnly),
            'has_tab'          => (bool) preg_match('/\t/', $valueOnly),
            'has_hash'         => str_contains($valueOnly, '#'),
            'has_dollar'       => str_contains($valueOnly, '$'),
            'has_backslash'    => str_contains($valueOnly, '\\'),
            'has_nbsp'         => str_contains($valueOnly, "\xC2\xA0"),
            'has_double_quote' => $hasDoubleQuotes,
            'has_single_quote' => $hasSingleQuotes,
        ];

        $this->line("  строка {$line}:");
        $this->line("    raw length (после =) : {$rawLen}");
        $this->line("    parsed length        : " . strlen($parsed));
        foreach ($flags as $name => $on) {
            if ($on) {
                $this->line("    {$name} : YES");
            }
        }

        // Подсказки
        if (!$hasDoubleQuotes && !$hasSingleQuotes) {
            if ($flags['has_space']) {
                $this->warn("    ⚠ значение содержит ПРОБЕЛ без кавычек — dotenv обрезает по нему. Оберните в \"...\".");
            }
            if ($flags['has_hash']) {
                $this->warn("    ⚠ значение содержит '#' без кавычек — всё после трактуется как комментарий. Оберните в \"...\".");
            }
        }
        if ($flags['has_nbsp']) {
            $this->warn("    ⚠ найден неразрывный пробел (\\xC2\\xA0). Перенаберите значение вручную.");
        }
        if ($flags['has_dollar'] && $hasDoubleQuotes) {
            $this->warn("    ⚠ '\$' в двойных кавычках интерпретируется как переменная. Используйте одинарные кавычки или экранируйте \\\$.");
        }
        if (strlen($parsed) !== strlen(trim($valueOnly, "\"'"))) {
            $this->warn("    ⚠ длина после парсинга отличается от ожидаемой — посмотрите флаги выше.");
        }
    }
}
