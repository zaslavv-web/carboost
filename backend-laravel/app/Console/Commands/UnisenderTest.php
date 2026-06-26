<?php

namespace App\Console\Commands;

use App\Services\EmailConfigService;
use App\Support\RuntimeEnv;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Отправляет тестовое письмо именно через Unisender Go.
 *   php artisan unisender:test you@example.com
 *
 * Для диагностики текущего активного канала можно использовать:
 *   php artisan unisender:test you@example.com --current
 */
class UnisenderTest extends Command
{
    protected $signature = 'unisender:test {to : Адрес получателя} {--current : Тестировать текущий MAIL_MAILER вместо принудительного Unisender Go}';
    protected $description = 'Отправить тестовое письмо через Unisender Go HTTP API';

    public function handle(EmailConfigService $emailConfig): int
    {
        $to = (string) $this->argument('to');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error("Неверный email: {$to}");
            return self::FAILURE;
        }

        $runtimeMailerRaw = RuntimeEnv::get('MAIL_MAILER') ?: '(пусто)';
        $runtimeMailer = strtolower((string) $runtimeMailerRaw);

        if ($this->option('current')) {
            $emailConfig->apply();
        } else {
            $emailConfig->applyHttpApiMailer('unisender_go');
        }

        $channel = $emailConfig->activeChannel();
        $endpoint = RuntimeEnv::get('UNISENDER_GO_ENDPOINT', 'https://go2.unisender.ru/ru/transactional/api/v1/email/send.json');
        $from = (string) (config('mail.from.address') ?: RuntimeEnv::get('MAIL_FROM_ADDRESS') ?: '(пусто)');

        $this->info('=== TEST EMAIL ===');
        $this->line('Канал       : ' . $channel);
        $this->line('MAIL_MAILER : ' . $runtimeMailerRaw);
        $this->line('From        : ' . $from);
        $this->line('To          : ' . $to);

        $key = RuntimeEnv::get('UNISENDER_GO_API_KEY');
        $this->line('API key     : ' . ($key ? 'есть (' . strlen($key) . ' симв.)' : 'НЕТ'));
        $this->line('Endpoint    : ' . $endpoint);

        if (!$key) {
            $this->error('UNISENDER_GO_API_KEY не задан в .env / окружении.');
            return self::FAILURE;
        }

        if ($runtimeMailer !== 'unisender_go') {
            $this->warn('В .env сейчас MAIL_MAILER=' . $runtimeMailerRaw . '. Эта команда принудительно проверит Unisender Go, но системные письма будут идти через SMTP, пока не поставить MAIL_MAILER=unisender_go.');
        }

        try {
            Mail::raw(
                "Тестовое письмо Growth Peak.\n\nКанал: {$channel}\nFrom: {$from}\nВремя: " . now()->toDateTimeString(),
                fn ($m) => $m->to($to)->subject('Тест отправки Growth Peak (' . $channel . ')')
            );
            $this->info('OK — письмо отправлено. Проверьте входящие и папку «Спам».');
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Ошибка отправки: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
