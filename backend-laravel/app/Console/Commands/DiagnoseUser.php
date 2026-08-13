<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Read-only срез одной учётной записи: что именно в ней отличается от
 * «обычного» пользователя. Ничего не меняет.
 *
 *   php artisan user:diagnose kafedina@postgroup.ru
 */
class DiagnoseUser extends Command
{
    protected $signature = 'user:diagnose {email}';
    protected $description = 'Показать состояние учётной записи (профиль, роли, компания, чаты)';

    public function handle(): int
    {
        $email = (string) $this->argument('email');
        $user = User::where('email', $email)->first();
        if (!$user) {
            $this->error("Пользователь {$email} не найден в users");
            return self::FAILURE;
        }

        $authId = (string) $user->getAuthIdentifier();
        $meta = is_array($user->meta) ? $user->meta : [];
        $metaSub = $meta['sub'] ?? null;
        $domainId = $user->domainUserId();

        $this->line('users.id        = ' . $authId);
        $this->line('meta.sub        = ' . ($metaSub ?? '—'));
        $this->line('domainUserId()  = ' . $domainId);
        if ($metaSub && (string) $metaSub !== $authId) {
            $this->warn('  ! meta.sub отличается от users.id — доменные таблицы читаются по meta.sub');
        }

        foreach (array_unique(array_filter([$authId, $metaSub, $domainId])) as $candidate) {
            $profile = DB::table('profiles')->where('user_id', $candidate)->first();
            $this->line(sprintf(
                'profiles[user_id=%s]: %s',
                $candidate,
                $profile
                    ? sprintf('is_verified=%s company_id=%s position_id=%s',
                        var_export((bool) ($profile->is_verified ?? false), true),
                        $profile->company_id ?? 'null',
                        $profile->position_id ?? 'null')
                    : 'СТРОКИ НЕТ',
            ));
        }

        $roles = DB::table('user_roles')->where('user_id', $domainId)->pluck('role')->all();
        $this->line('user_roles      = ' . ($roles ? implode(', ', $roles) : '— (пусто)'));

        $participants = DB::table('chat_participants')->where('user_id', $domainId)->count();
        $distinct = DB::table('chat_participants')->where('user_id', $domainId)
            ->distinct()->count('conversation_id');
        $this->line("chat_participants = {$participants} (уникальных диалогов: {$distinct})");
        if ($participants > $distinct) {
            $this->warn('  ! есть дубли участия — счётчик непрочитанных умножается на число дублей');
        }

        $tokens = DB::table('personal_access_tokens')
            ->where('tokenable_id', $authId)->count();
        $this->line("personal_access_tokens = {$tokens}");

        $this->line('isVerified()    = ' . var_export($user->isVerified(), true));
        $this->line('companyId()     = ' . ($user->companyId() ?? 'null'));

        return self::SUCCESS;
    }
}
