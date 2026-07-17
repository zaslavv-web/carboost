<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Восстанавливает profiles.company_id для пользователей, у которых он утерян.
 *
 * Порядок резолва компании:
 *   1) positions.company_id по profiles.position_id
 *   2) departments.company_id по positions.department_id (через profiles.position_id)
 *   3) team_members: компания менеджера сотрудника
 *   4) employee_invitations.company_id по claimed_user_id / email
 *   5) --company-id / --company-name — явное указание для «сирот»
 */
class FixCompanyLinks extends Command
{
    protected $signature = 'org:fix-company-links
        {--dry-run : Только показать, что будет сделано, без изменений}
        {--company-id= : UUID компании, куда прикрепить оставшихся сирот}
        {--company-name= : Имя компании (альтернатива --company-id)}
        {--only-seed-marker= : Ограничить users.meta->>seed_marker}';

    protected $description = 'Backfill profiles.company_id для сотрудников с пустой компанией';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $onlyMarker = $this->option('only-seed-marker');

        $fallbackCompanyId = $this->option('company-id');
        if (!$fallbackCompanyId && ($name = $this->option('company-name'))) {
            $fallbackCompanyId = DB::table('companies')->where('name', $name)->value('id');
            if (!$fallbackCompanyId) {
                $this->error("Компания '{$name}' не найдена");
                return self::FAILURE;
            }
        }

        // Собираем кандидатов (только реально существующие в profiles колонки)
        $usersQ = DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->select('u.id', 'u.email', 'u.meta', 'p.company_id as p_company', 'p.position_id')
            ->where(function ($q) {
                $q->whereNull('p.company_id')
                  ->orWhereRaw("COALESCE(NULLIF(CAST(p.company_id AS CHAR), ''), '') = ''");
            });

        if ($onlyMarker) {
            $usersQ->where('u.meta', 'like', '%"seed_marker":"' . $onlyMarker . '"%');
        }

        $rows = $usersQ->get();
        $this->info("Кандидатов на починку: {$rows->count()}");

        $hasEmpTable  = Schema::hasTable('employee_invitations');
        $hasTeam      = Schema::hasTable('team_members');
        $hasPositions = Schema::hasTable('positions');
        $hasDepts     = Schema::hasTable('departments');
        $posHasDeptId = $hasPositions && Schema::hasColumn('positions', 'department_id');

        $stats = [
            'positions' => 0, 'departments' => 0, 'team_members' => 0,
            'invitations' => 0, 'fallback' => 0,
            'created_profile' => 0, 'unresolved' => 0,
        ];

        foreach ($rows as $r) {
            $cid = null;
            $via = null;

            if ($r->position_id && $hasPositions) {
                $cid = DB::table('positions')->where('id', $r->position_id)->value('company_id');
                if ($cid) $via = 'positions';

                if (!$cid && $posHasDeptId && $hasDepts) {
                    $deptId = DB::table('positions')->where('id', $r->position_id)->value('department_id');
                    if ($deptId) {
                        $cid = DB::table('departments')->where('id', $deptId)->value('company_id');
                        if ($cid) $via = 'departments';
                    }
                }
            }

            if (!$cid && $hasTeam) {
                $managerId = DB::table('team_members')->where('employee_id', $r->id)->value('manager_id');
                if ($managerId) {
                    $cid = DB::table('profiles')->where('user_id', $managerId)->value('company_id');
                    if ($cid) $via = 'team_members';
                }
            }

            if (!$cid && $hasEmpTable) {
                $cid = DB::table('employee_invitations')
                    ->where(function ($q) use ($r) {
                        $q->where('claimed_user_id', $r->id)->orWhere('email', $r->email);
                    })
                    ->value('company_id');
                if ($cid) $via = 'invitations';
            }

            if (!$cid && $fallbackCompanyId) {
                $cid = $fallbackCompanyId;
                $via = 'fallback';
            }

            if (!$cid) {
                $stats['unresolved']++;
                continue;
            }

            $stats[$via]++;
            if ($dry) {
                $this->line(" - {$r->email} → {$cid} (via {$via})");
                continue;
            }

            $exists = DB::table('profiles')->where('user_id', $r->id)->exists();
            if ($exists) {
                DB::table('profiles')->where('user_id', $r->id)->update([
                    'company_id' => $cid,
                    'updated_at' => now(),
                ]);
            } else {
                $ins = [
                    'user_id'    => $r->id,
                    'company_id' => $cid,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if (Schema::hasColumn('profiles', 'id')) {
                    $ins['id'] = (string) Str::uuid();
                }
                if (Schema::hasColumn('profiles', 'is_verified')) {
                    $ins['is_verified'] = true;
                }
                if (Schema::hasColumn('profiles', 'requested_role')) {
                    $ins['requested_role'] = 'employee';
                }
                if (Schema::hasColumn('profiles', 'full_name')) {
                    $ins['full_name'] = $r->email;
                }
                DB::table('profiles')->insert($ins);
                $stats['created_profile']++;
            }
        }

        $this->info('Итого:');
        foreach ($stats as $k => $v) {
            $this->line("  {$k}: {$v}");
        }
        if ($dry) {
            $this->warn('DRY-RUN: изменения не применены.');
        }
        return self::SUCCESS;
    }
}
