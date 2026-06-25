<?php

namespace App\Console\Commands;

use App\Models\EmailSetting;
use Illuminate\Console\Command;

/**
 * Деактивирует все записи в email_settings, чтобы они не перекрывали .env.
 *   php artisan smtp:db-clear
 */
class SmtpDbClear extends Command
{
    protected $signature = 'smtp:db-clear';
    protected $description = 'Деактивировать SMTP-записи в БД (email_settings), чтобы Laravel брал настройки только из .env';

    public function handle(): int
    {
        $count = EmailSetting::query()->where('is_active', true)->count();
        EmailSetting::query()->update(['is_active' => false]);
        $this->info("Деактивировано записей: {$count}. Теперь источник SMTP — .env.");
        return self::SUCCESS;
    }
}
