<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Сброс пароля и восстановление доступа суперадмину.
 *   php artisan superadmin:reset-password admin@example.com
 *
 * Пароль запрашивается интерактивно и не попадает в bash history.
 * Дополнительно назначает роль superadmin и выставляет is_verified=true.
 */
class SuperadminResetPassword extends Command
{
    protected $signature = 'superadmin:reset-password {email : Email пользователя}';
    protected $description = 'Сбросить пароль пользователю и назначить ему роль superadmin';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Некорректный email: ' . $email);
            return self::FAILURE;
        }

        $user = DB::table('users')->where('email', $email)->first();
        if (!$user) {
            $this->error("Пользователь {$email} не найден в таблице users.");
            return self::FAILURE;
        }

        $password = $this->secret('Новый пароль (минимум 8 символов)');
        $confirm = $this->secret('Повторите пароль');
        if ($password !== $confirm) {
            $this->error('Пароли не совпадают.');
            return self::FAILURE;
        }
        if (strlen($password) < 8) {
            $this->error('Пароль слишком короткий.');
            return self::FAILURE;
        }

        DB::transaction(function () use ($user, $email, $password) {
            DB::table('users')->where('id', $user->id)->update([
                'password' => Hash::make($password),
                'updated_at' => now(),
            ]);

            // Найти domain-профиль и подтвердить верификацию.
            $profile = DB::table('profiles')
                ->where('user_id', $user->id)
                ->orWhere('id', $user->id)
                ->first();

            if ($profile && Schema::hasColumn('profiles', 'is_verified')) {
                DB::table('profiles')->where('id', $profile->id)->update([
                    'is_verified' => true,
                    'updated_at' => now(),
                ]);
            }

            // Назначить роль superadmin.
            if (Schema::hasTable('user_roles')) {
                $domainUserId = (string) ($profile->user_id ?? $user->id);
                $exists = DB::table('user_roles')
                    ->where('user_id', $domainUserId)
                    ->where('role', 'superadmin')
                    ->exists();
                if (!$exists) {
                    $row = ['user_id' => $domainUserId, 'role' => 'superadmin'];
                    if (Schema::hasColumn('user_roles', 'id')) {
                        $row['id'] = (string) Str::uuid();
                    }
                    if (Schema::hasColumn('user_roles', 'created_at')) $row['created_at'] = now();
                    if (Schema::hasColumn('user_roles', 'updated_at')) $row['updated_at'] = now();
                    DB::table('user_roles')->insert($row);
                }
            }
        });

        $this->info("Готово. Пароль обновлён, роль superadmin назначена, пользователь верифицирован.");
        $this->line("Email: {$email}");
        return self::SUCCESS;
    }
}
