<?php

namespace App\Console\Commands;

use App\Services\Automation\ComfortAnalysisService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ComfortCompute extends Command
{
    protected $signature = 'comfort:compute {--company= : UUID компании; без флага — все компании}';
    protected $description = 'Пересчитать индексы комфорта работы (user/department/company)';

    public function handle(ComfortAnalysisService $svc): int
    {
        $companies = $this->option('company')
            ? collect([(object) ['id' => $this->option('company')]])
            : DB::table('companies')->select('id')->get();

        foreach ($companies as $c) {
            $r = $svc->computeForCompany((string) $c->id);
            $this->info("company={$c->id} users={$r['users']} depts={$r['departments']} idx={$r['company_index']}");
        }
        return self::SUCCESS;
    }
}
