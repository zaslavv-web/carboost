<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/** Batch 1: submit_demo_request / submit_pricing_inquiry (PG → PHP). */
class LeadService
{
    public function submitDemo(array $p): string
    {
        $name = trim((string)($p['name'] ?? ''));
        $email = strtolower(trim((string)($p['email'] ?? '')));
        $company = $p['company'] ?? null;
        $headcount = isset($p['headcount']) ? (int)$p['headcount'] : null;
        $source = trim((string)($p['source'] ?? 'landing')) ?: 'landing';

        if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
            throw new RuntimeException('Имя должно быть от 2 до 120 символов');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Некорректный email');
        }
        if ($company !== null && mb_strlen(trim((string)$company)) > 200) {
            throw new RuntimeException('Слишком длинное название компании');
        }
        if ($headcount !== null && ($headcount < 1 || $headcount > 1_000_000)) {
            throw new RuntimeException('Некорректный размер команды');
        }

        $id = (string) Str::uuid();
        DB::table('demo_requests')->insert([
            'id'         => $id,
            'name'       => $name,
            'email'      => $email,
            'company'    => $company ? (trim($company) ?: null) : null,
            'headcount'  => $headcount,
            'source'     => $source,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return $id;
    }

    public function submitPricing(array $p): string
    {
        $name = trim((string)($p['name'] ?? ''));
        $email = strtolower(trim((string)($p['email'] ?? '')));
        $plan = (string)($p['plan'] ?? '');
        $company = $p['company'] ?? null;
        $phone = $p['phone'] ?? null;
        $headcount = isset($p['headcount']) ? (int)$p['headcount'] : null;
        $message = $p['message'] ?? null;
        $source = trim((string)($p['source'] ?? 'pricing_page')) ?: 'pricing_page';

        if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
            throw new RuntimeException('Имя должно быть от 2 до 120 символов');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Некорректный email');
        }
        if (!in_array($plan, ['cloud', 'on_premise'], true)) {
            throw new RuntimeException('Неверный тариф');
        }
        if ($company !== null && mb_strlen(trim((string)$company)) > 200) {
            throw new RuntimeException('Слишком длинное название компании');
        }
        if ($headcount !== null && ($headcount < 1 || $headcount > 1_000_000)) {
            throw new RuntimeException('Некорректный размер команды');
        }
        if ($message !== null && mb_strlen((string)$message) > 4000) {
            throw new RuntimeException('Слишком длинный комментарий');
        }

        $id = (string) Str::uuid();

        DB::transaction(function () use ($id, $name, $email, $plan, $company, $phone, $headcount, $message, $source) {
            DB::table('pricing_inquiries')->insert([
                'id'         => $id,
                'name'       => $name,
                'email'      => $email,
                'company'    => $this->nz($company),
                'phone'      => $this->nz($phone),
                'plan'       => $plan,
                'headcount'  => $headcount,
                'message'    => $this->nz($message),
                'source'     => $source,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // Уведомляем суперадминов
            $admins = DB::table('user_roles as ur')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'ur.user_id')
                ->where('ur.role', 'superadmin')
                ->get(['ur.user_id', 'p.company_id']);

            $planTitle = $plan === 'cloud' ? 'Cloud' : 'On-Premise';
            $desc = $name . ' (' . $email . ')'
                . ($company ? ' • ' . $company : '')
                . ($headcount ? ' • ' . $headcount . ' чел.' : '')
                . ($message ? "\n" . $message : '');

            foreach ($admins as $a) {
                DB::table('notifications')->insert([
                    'id'                => (string) Str::uuid(),
                    'user_id'           => $a->user_id,
                    'company_id'        => $a->company_id,
                    'title'             => '💼 Новая заявка на тариф (' . $planTitle . ')',
                    'description'       => $desc,
                    'notification_type' => 'pricing_inquiry',
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        });

        return $id;
    }

    private function nz(mixed $v): ?string
    {
        if ($v === null) return null;
        $t = trim((string)$v);
        return $t === '' ? null : $t;
    }
}
