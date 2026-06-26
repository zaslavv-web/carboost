<?php

namespace App\Console\Commands;

use App\Services\EmailConfigService;
use App\Support\RuntimeEnv;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/**
 * Отправляет тестовое письмо через активный mailer (Unisender Go / SMTP).
 *   php artisan unisender:test you@example.com
 */
class UnisenderTest extends Command
{
    protected $signature = 'unisender:test {to : Адрес получателя}';
    protected $description = 'Отправить тестовое письмо через текущий канал (Unisender Go / SMTP)';

    public function handle(EmailConfigService $emailConfig): int
    {
        $to = (string) $this->argument('to');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $this->error("Неверный email: {$to}");
            return self::FAILURE;
        }

        $emailConfig->apply();
        $channel = $emailConfig->activeChannel();
        $from    = RuntimeEnv::get('MAIL_FROM_ADDRESS') ?: '(пусто)';

        $this->info('=== TEST EMAIL ===');
        $this->line('Канал       : ' . $channel);
        $this->line('From        : ' . $from);
        $this->line('To          : ' . $to);

        if ($channel === 'unisender_go') {
            $key = RuntimeEnv::get('UNISENDER_GO_API_KEY');
            $this->line('API key     : ' . ($key ? 'есть (' . strlen($key) . ' симв.)' : 'НЕТ'));
            if (!$key) {
                $this->error('UNISENDER_GO_API_KEY не задан в .env / окружении.');
                return self::FAILURE;
            }
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
