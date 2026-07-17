<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ClearRecentInvitations extends Command
{
    protected $signature = 'invitations:clear-recent
        {--hours=2 : За сколько последних часов очистить pending-приглашения}
        {--company-name= : Ограничить очистку конкретной компанией}
        {--company-id= : Ограничить очистку конкретной компанией по UUID}
        {--dry-run : Только показать, что будет очищено}';

    protected $description = 'Cancels recent pending employee invitations so they can be recreated and resent cleanly';

    public function handle(): int
    {
        if (!Schema::hasTable('employee_invitations')) {
            $this->error('Таблица employee_invitations не найдена');
            return self::FAILURE;
        }

        $hours = max(1, (int) $this->option('hours'));
        $companyId = $this->option('company-id');

        if (!$companyId && ($companyName = $this->option('company-name'))) {
            $companyId = DB::table('companies')->where('name', $companyName)->value('id');
            if (!$companyId) {
                $this->error("Компания '{$companyName}' не найдена");
                return self::FAILURE;
            }
        }

        $since = now()->subHours($hours);
        $query = DB::table('employee_invitations')
            ->where('status', 'pending')
            ->where('created_at', '>=', $since);

        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        $count = (clone $query)->count();
        $this->info("Pending-приглашений за последние {$hours} ч.: {$count}");

        if ($count === 0) {
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            (clone $query)
                ->select('email', 'company_id', 'created_at')
                ->orderByDesc('created_at')
                ->limit(20)
                ->get()
                ->each(fn ($row) => $this->line(" - {$row->email} / {$row->company_id} / {$row->created_at}"));

            $this->warn('DRY-RUN: изменения не применены.');
            return self::SUCCESS;
        }

        $affected = (clone $query)->update([
            'status' => 'cancelled',
            'updated_at' => now(),
        ]);

        $this->info("Очищено pending-приглашений: {$affected}");
        return self::SUCCESS;
    }
}