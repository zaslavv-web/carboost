<?php

namespace App\Console\Commands;

use App\Services\AuthUserService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Создаёт (или восстанавливает) администратора компании для демо-компании.
 *
 * Пароль по умолчанию совпадает с паролем остальных демо-сотрудников
 * (см. SeedDemoCompany::$password).
 *
 * Примеры:
 *   php artisan demo:create-admin
 *   php artisan demo:create-admin --company="Demo_doom"
 *   php artisan demo:create-admin --company=<uuid> --email=admin.01@demo.pikrosta.ru
 */
class DemoCreateAdmin extends Command
{
    protected $signature = 'demo:create-admin
        {--company= : id или имя компании (по умолчанию — компания демо-аккаунтов)}
        {--email= : email админа (по умолчанию company_admin.01@<домен демо>)}
        {--password= : пароль (по умолчанию как у остальных демо-сотрудников)}
        {--name= : ФИО админа}';

    protected $description = 'Создаёт администратора компании (company_admin) для демо-компании';

    private string $emailDomain = 'demo.pikrosta.ru';
    private string $defaultPassword = 'DemoPass!2026';

    public function handle(AuthUserService $auth): int
    {
        $companyId = $this->resolveCompany();
        if (!$companyId) {
            $this->error('Компания не найдена. Укажите --company=<id|имя>.');
            return 1;
        }

        $companyName = (string) DB::table('companies')->where('id', $companyId)->value('name');
        $email       = strtolower(trim((string) ($this->option('email') ?: 'company_admin.01@' . $this->emailDomain)));
        $password    = (string) ($this->option('password') ?: $this->defaultPassword);
        $fullName    = (string) ($this->option('name') ?: 'Администратор компании');

        $this->line("Компания: {$companyName} ({$companyId})");

        $existingId = DB::table('users')->where('email', $email)->value('id');

        if ($existingId) {
            $uid = (string) $existingId;
            DB::table('users')->where('id', $uid)->update([
                'password'          => \Illuminate\Support\Facades\Hash::make($password),
                'email_verified_at' => now(),
                'updated_at'        => now(),
            ]);
            $this->line("Пользователь уже существует — пароль обновлён: {$email}");
        } else {
            $user = $auth->createWithPassword(
                $email,
                $password,
                $fullName,
                'company_admin',
                companyId: $companyId,
                isVerified: true,
            );
            $uid = (string) $user->id;
            $this->line("Создан пользователь: {$email}");
        }

        // Профиль: компания, ФИО, верификация
        $profileExists = DB::table('profiles')->where('user_id', $uid)->exists();
        $profileData = [
            'company_id'     => $companyId,
            'full_name'      => $fullName,
            'requested_role' => 'company_admin',
            'is_verified'    => true,
            'position'       => 'Администратор компании',
            'updated_at'     => now(),
        ];
        if ($profileExists) {
            DB::table('profiles')->where('user_id', $uid)->update($profileData);
        } else {
            DB::table('profiles')->insert($profileData + [
                'user_id'    => $uid,
                'created_at' => now(),
            ]);
        }

        // Роль: строго одна — company_admin
        DB::table('user_roles')->where('user_id', $uid)->delete();
        $roleRow = ['user_id' => $uid, 'role' => 'company_admin'];
        if (!DB::getSchemaBuilder()->hasColumn('user_roles', 'id')) {
            DB::table('user_roles')->insert($roleRow);
        } else {
            DB::table('user_roles')->insert($roleRow + ['id' => (string) \Illuminate\Support\Str::uuid()]);
        }

        $this->info("✅ Администратор готов: {$email} / пароль как у остальных демо-сотрудников");
        return 0;
    }

    private function resolveCompany(): ?string
    {
        $opt = trim((string) $this->option('company'));

        if ($opt !== '') {
            $byId = DB::table('companies')->where('id', $opt)->value('id');
            if ($byId) return (string) $byId;

            $byName = DB::table('companies')->where('name', $opt)->value('id');
            if ($byName) return (string) $byName;

            $byLike = DB::table('companies')->where('name', 'like', '%' . $opt . '%')->value('id');
            if ($byLike) return (string) $byLike;

            return null;
        }

        // Компания, к которой привязаны демо-аккаунты
        $id = DB::table('profiles')
            ->join('users', 'users.id', '=', 'profiles.user_id')
            ->where('users.email', 'like', '%@' . $this->emailDomain)
            ->whereNotNull('profiles.company_id')
            ->value('profiles.company_id');

        return $id ? (string) $id : null;
    }
}
