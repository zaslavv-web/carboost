<?php

namespace App\Console\Commands;

use App\Services\EmailConfigService;
use App\Support\ServiceInfra;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Ежедневный heartbeat SMTP: шлёт тестовое письмо на monitor inbox.
 * Если письмо не приходит — почтовый сервер сломан.
 */
class SendMailHeartbeat extends Command
{
    protected $signature = 'mail:heartbeat';
    protected $description = 'Send daily SMTP heartbeat email to monitor inbox';

    public function handle(EmailConfigService $emailConfig): int
    {
        if (!ServiceInfra::heartbeatEnabled()) {
            $this->info('Mail heartbeat disabled, skipping.');
            return self::SUCCESS;
        }

        $inbox = ServiceInfra::monitorInbox();
        if (!$inbox) {
            $this->warn('Monitor inbox not configured, skipping heartbeat.');
            return self::SUCCESS;
        }

        try {
            $emailConfig->apply();
        } catch (\Throwable $e) {
            Log::error('mail_heartbeat_failed', [
                'stage' => 'apply_config',
                'error' => $e->getMessage(),
            ]);
            $this->error('SMTP config apply failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $summary = $emailConfig->currentSmtpSummary();
        $date = now()->format('Y-m-d H:i:s');
        $source = $emailConfig->hasActiveStoredSettings() ? 'database (email_settings)' : 'file (service-infra.php)';

        $body = "SMTP heartbeat OK\n\n"
            . "Время сервера: {$date}\n"
            . "Хост: {$summary['host']}:{$summary['port']} ({$summary['encryption']})\n"
            . "Логин: {$summary['username']}\n"
            . "Источник конфигурации: {$source}\n";

        try {
            Mail::raw($body, function ($message) use ($inbox, $date) {
                $message->to($inbox)
                    ->subject('[Пик Роста] SMTP heartbeat ' . substr($date, 0, 10));
            });
        } catch (\Throwable $e) {
            Log::error('mail_heartbeat_failed', [
                'stage' => 'send',
                'error' => $e->getMessage(),
                'inbox' => $inbox,
            ]);
            $this->error('Heartbeat send failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info("Heartbeat sent to {$inbox}.");
        return self::SUCCESS;
    }
}
