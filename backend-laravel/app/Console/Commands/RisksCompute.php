<?php

namespace App\Console\Commands;

use App\Services\Automation\RiskComputationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RisksCompute extends Command
{
    protected $signature = 'risks:compute {--company= : UUID компании; без флага — все компании}';
    protected $description = 'Пересчитать оценки рисков сотрудников и разослать алерты при переходе в high';

    public function handle(RiskComputationService $svc): int
    {
        $companies = $this->option('company')
            ? collect([(object) ['id' => $this->option('company')]])
            : DB::table('companies')->select('id')->get();

        $total = 0;
        foreach ($companies as $c) {
            $n = $svc->computeForCompany((string) $c->id);
            $this->info("company={$c->id} processed={$n}");
            $total += $n;
        }
        $this->info("Total updated: $total");
        return self::SUCCESS;
    }
}
