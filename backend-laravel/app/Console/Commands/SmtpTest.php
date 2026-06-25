<?php

namespace App\Console\Commands;

use App\Services\EmailConfigService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;

/**
 * Отправляет тестовое письмо.
 *   php artisan smtp:test you@example.com
 *   php artisan smtp:test --env-file=/абс/путь/backend-laravel/.env you@example.com
 */
class SmtpTest extends Command
{
    protected $signature = 'smtp:test {to : Email получателя} {--env-file= : Принудительно использовать SMTP-настройки из указанного .env}';
    protected $description = 'Отправить тестовое письмо через текущую конфигурацию SMTP (.env по умолчанию)';

    public function handle(EmailConfigService $emailConfig): int
    {
        $to = (string) $this->argument('to');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error('Некорректный email: ' . $to);
            return self::FAILURE;
        }

        $envFile = $this->option('env-file');
        if ($envFile) {
            if (!is_file($envFile)) {
                $this->error("Файл не найден: {$envFile}");
                return self::FAILURE;
            }
            $this->line('Источник SMTP: --env-file=' . $envFile);
            $this->applyFromEnvFile($envFile);
        } else {
            try {
                $emailConfig->apply();
            } catch (\Throwable $e) {
                $this->error('Ошибка применения SMTP-конфигурации: ' . $e->getMessage());
                return self::FAILURE;
            }
        }

        $summary = $emailConfig->currentSmtpSummary();
        $this->line('base_path         : ' . base_path());
        $this->line('env file (Laravel): ' . app()->environmentFilePath());
        $this->line('Использую: ' . $summary['host'] . ':' . $summary['port']
            . ' (' . ($summary['encryption'] ?: 'none') . ') как ' . ($summary['username'] ?: '(без логина)'));

        try {
            Mail::raw(
                "Это тестовое письмо от Пик Роста.\n\nЕсли вы его получили, SMTP работает корректно.\nВремя: " . now()->toDateTimeString(),
                function ($message) use ($to) {
                    $message->to($to)->subject('[Пик Роста] SMTP test ' . now()->format('H:i:s'));
                }
            );
        } catch (\Throwable $e) {
            $this->error('Отправка не удалась: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info("Тестовое письмо отправлено на {$to}. Проверьте «Входящие» и «Спам».");
        return self::SUCCESS;
    }

    /**
     * Парсит указанный .env вручную и подменяет config('mail.*') в рамках команды.
     */
    private function applyFromEnvFile(string $path): void
    {
        $values = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v);
            if ((str_starts_with($v, '"') && str_ends_with($v, '"'))
                || (str_starts_with($v, "'") && str_ends_with($v, "'"))) {
                $v = substr($v, 1, -1);
            }
            $values[$k] = $v;
        }

        $host = $values['MAIL_HOST'] ?? 'smtp.yandex.ru';
        $port = (int) ($values['MAIL_PORT'] ?? 465);
        $enc = strtolower($values['MAIL_ENCRYPTION'] ?? 'ssl');
        $user = $values['MAIL_USERNAME'] ?? null;
        $pass = $values['MAIL_PASSWORD'] ?? $values['SMTP_PASSWORD'] ?? null;
        $from = $values['MAIL_FROM_ADDRESS'] ?? $user;
        $fromName = $values['MAIL_FROM_NAME'] ?? 'Пик Роста';

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $enc === 'none' ? null : $enc,
            'username' => $user,
            'password' => $pass,
            'timeout' => 30,
            'local_domain' => null,
        ]);
        Config::set('mail.from', ['address' => $from, 'name' => $fromName]);

        // Сброс уже инстанциированного MailManager, чтобы он перечитал config.
        app()->forgetInstance('mail.manager');
        app()->forgetInstance('mailer');
        \Illuminate\Support\Facades\Mail::clearResolvedInstances();
    }
}
