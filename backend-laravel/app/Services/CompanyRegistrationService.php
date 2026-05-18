<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/** Batch 1: register_company / find_company_by_name (PG → PHP). */
class CompanyRegistrationService
{
    public function findByName(string $name): ?string
    {
        $clean = mb_strtolower(trim($name));
        if ($clean === '') return null;
        return DB::table('companies')
            ->whereRaw('lower(btrim(name)) = ?', [$clean])
            ->value('id');
    }

    public function register(string $name): string
    {
        $clean = trim($name);
        if (mb_strlen($clean) < 2) {
            throw new RuntimeException('Название компании должно содержать минимум 2 символа');
        }
        if (mb_strlen($clean) > 120) {
            throw new RuntimeException('Название компании слишком длинное (максимум 120 символов)');
        }
        if ($this->findByName($clean)) {
            throw new RuntimeException('Компания с таким названием уже зарегистрирована');
        }
        $id = (string) Str::uuid();
        DB::table('companies')->insert(['id' => $id, 'name' => $clean]);
        return $id;
    }
}
