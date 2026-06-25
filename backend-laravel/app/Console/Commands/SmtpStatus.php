<?php

namespace App\Console\Commands;

use App\Models\EmailSetting;
use App\Services\EmailConfigService;
use App\Support\RuntimeEnv;
use Illuminate\Console\Command;

/**
 * Показывает текущий активный источник SMTP без вывода пароля.
 *   php artisan smtp:status
 */
class SmtpStatus extends Command
{
    protected $signature = 'smtp:status';
    protected $description = 'Показать активные SMTP-настройки и их источник (.env / БД / файл)';

    public function handle(EmailConfigService $emailConfig): int
    {
        $envHost = RuntimeEnv::get('MAIL_HOST');
        $envFrom = RuntimeEnv::get('MAIL_FROM_ADDRESS');
        $envUser = RuntimeEnv::get('MAIL_USERNAME');
        $envPass = RuntimeEnv::get('MAIL_PASSWORD') ?: RuntimeEnv::get('SMTP_PASSWORD');

        $dbActive = EmailSetting::query()->where('is_active', true)->latest('updated_at')->first();

        $source = 'unknown';
        if ($envHost && $envFrom && $envPass) {
            $source = '.env (приоритет)';
        } elseif ($dbActive) {
            $source = 'БД (email_settings)';
        } else {
            $source = 'файл / fallback';
        }

        $emailConfig->apply();
        $summary = $emailConfig->currentSmtpSummary();

        $this->line('');
        $this->info('=== SMTP STATUS ===');
        $this->line('base_path         : ' . base_path());
        $this->line('env file (loaded) : ' . app()->environmentFilePath());
        $this->line("Активный источник : {$source}");
        $this->line('');
        $this->line('--- .env ---');
        $this->line('MAIL_HOST         : ' . ($envHost ?: '(пусто)'));
        $this->line('MAIL_PORT         : ' . (RuntimeEnv::get('MAIL_PORT') ?: '(пусто)'));
        $this->line('MAIL_ENCRYPTION   : ' . (RuntimeEnv::get('MAIL_ENCRYPTION') ?: '(пусто)'));
        $this->line('MAIL_USERNAME     : ' . ($envUser ?: '(пусто)'));
        $this->line('MAIL_PASSWORD     : ' . ($envPass ? 'есть (' . strlen($envPass) . ' симв.)' : 'НЕТ'));
        $this->line('MAIL_FROM_ADDRESS : ' . ($envFrom ?: '(пусто)'));
        $this->line('MAIL_FROM_NAME    : ' . (RuntimeEnv::get('MAIL_FROM_NAME') ?: '(пусто)'));
        $this->line('SALES_NOTIFICATION_EMAIL : ' . (RuntimeEnv::get('SALES_NOTIFICATION_EMAIL') ?: '(пусто)'));
        $this->line('');
        $this->line('--- email_settings (БД) ---');
        if ($dbActive) {
            $this->line('id          : ' . $dbActive->id);
            $this->line('host        : ' . $dbActive->host);
            $this->line('username    : ' . $dbActive->username);
            $this->line('from        : ' . $dbActive->from_address);
            $this->line('is_active   : true');
            $this->warn('Запись в БД активна, но игнорируется — приоритет у .env. Очистить: php artisan smtp:db-clear');
        } else {
            $this->line('активная запись : отсутствует');
        }
        $this->line('');
        $this->line('--- эффективная конфигурация Laravel ---');
        $this->line('host        : ' . $summary['host']);
        $this->line('port        : ' . $summary['port']);
        $this->line('encryption  : ' . ($summary['encryption'] ?: 'none'));
        $this->line('username    : ' . ($summary['username'] ?: '(пусто)'));
        $this->line('');

        return self::SUCCESS;
    }
}
