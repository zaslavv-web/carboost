<?php

namespace App\Console\Commands;

use App\Services\EmailConfigService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Отправляет тестовое письмо через тот же канал, что и заявки с лендинга.
 *   php artisan smtp:test you@example.com
 */
class SmtpTest extends Command
{
    protected $signature = 'smtp:test {to : Email получателя}';
    protected $description = 'Отправить тестовое письмо через текущую конфигурацию SMTP (.env по умолчанию)';

    public function handle(EmailConfigService $emailConfig): int
    {
        $to = (string) $this->argument('to');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error('Некорректный email: ' . $to);
            return self::FAILURE;
        }

        try {
            $emailConfig->apply();
        } catch (\Throwable $e) {
            $this->error('Ошибка применения SMTP-конфигурации: ' . $e->getMessage());
            return self::FAILURE;
        }

        $summary = $emailConfig->currentSmtpSummary();
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
}
