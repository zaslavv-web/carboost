<?php

namespace App\Console\Commands;

use App\Services\CompanyRecoveryService;
use Illuminate\Console\Command;

class RecoverMissingCompanies extends Command
{
    protected $signature = 'companies:recover-missing
        {--apply : Создать отсутствующие строки в companies}
        {--name= : Название, если восстанавливается ровно одна компания}
        {--include-demo-orphans : Также восстанавливать старые demo company_id, если остались только demo-пользователи}';

    protected $description = 'Восстанавливает удалённые строки companies по сохранившимся company_id в связанных таблицах';

    public function handle(CompanyRecoveryService $service): int
    {
        $apply = (bool) $this->option('apply');
        $result = $service->recoverMissingCompanies(
            apply: $apply,
            singleName: $this->option('name') ? (string) $this->option('name') : null,
            includeDemoOrphans: (bool) $this->option('include-demo-orphans'),
        );

        if ($result['missing_count'] === 0) {
            $this->info('Отсутствующих companies по сохранившимся company_id не найдено.');
            return self::SUCCESS;
        }

        $this->warn($apply
            ? "Восстановлено companies: {$result['missing_count']}"
            : "Dry-run: найдено отсутствующих companies: {$result['missing_count']}");

        $this->table(
            ['id', 'name', 'profiles', 'demo_profiles', 'departments', 'positions', 'tasks', 'status'],
            array_map(fn (array $row) => [
                $row['id'],
                $row['name'],
                $row['profiles'],
                $row['demo_profiles'],
                $row['departments'],
                $row['positions'],
                $row['tasks'],
                $row['status'],
            ], $result['companies'])
        );

        if (! $apply) {
            $this->line('Чтобы применить восстановление: php artisan companies:recover-missing --apply');
            $this->line('Если нужно восстановить старые demo company_id: добавьте --include-demo-orphans');
        }

        return self::SUCCESS;
    }
}