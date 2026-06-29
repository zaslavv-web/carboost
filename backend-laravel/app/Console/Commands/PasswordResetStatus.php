<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Диагностика password reset для конкретного email.
 *   php artisan password:reset-status user@example.com
 *
 * Печатает: есть ли пользователь, есть ли активный токен,
 * сколько минут токену, истёк ли он (по config('auth.passwords.users.expire')).
 */
class PasswordResetStatus extends Command
{
    protected $signature = 'password:reset-status {email}';
    protected $description = 'Показать состояние password reset для email (есть ли токен, возраст, истёк ли)';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));

        $user = DB::table('users')
            ->whereRaw('LOWER(email) = ?', [$email])
            ->select('id', 'email', 'created_at', 'updated_at')
            ->first();

        if (!$user) {
            $this->warn("Пользователь {$email} НЕ найден (LOWER-match).");
        } else {
            $this->info('User: ' . json_encode((array) $user, JSON_UNESCAPED_UNICODE));
        }

        $row = DB::table('password_reset_tokens')->where('email', $email)->first();
        if (!$row) {
            $this->warn("В password_reset_tokens записи для {$email} нет.");
            $this->line('→ Токен уже использован, удалён, или письмо не запрашивалось.');
            return self::SUCCESS;
        }

        $expireMin = (int) config('auth.passwords.users.expire', 60);
        $createdAt = Carbon::parse($row->created_at);
        $ageMin = (int) $createdAt->diffInMinutes(now());
        $expired = $ageMin > $expireMin;

        $this->info('Token row found:');
        $this->line('  email:        ' . $row->email);
        $this->line('  created_at:   ' . $row->created_at . " ({$ageMin} мин назад)");
        $this->line('  expire limit: ' . $expireMin . ' мин');
        $this->line('  status:       ' . ($expired ? 'EXPIRED' : 'VALID'));

        return self::SUCCESS;
    }
}
