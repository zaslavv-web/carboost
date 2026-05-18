<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/** Batch 1: bulk_invite_employees (PG → PHP). */
class InvitationService
{
    public function bulkInvite(User $actor, array $invites): array
    {
        if (!$actor->hasRole('hrd') && !$actor->hasRole('company_admin') && !$actor->hasRole('superadmin')) {
            throw new RuntimeException('Только HRD или администратор могут массово приглашать');
        }
        $companyId = $actor->companyId();
        if (!$companyId) {
            throw new RuntimeException('Не определена компания');
        }
        if (!array_is_list($invites)) {
            throw new RuntimeException('Список должен быть массивом');
        }

        $created = 0;
        $skipped = 0;
        $errors = [];

        foreach ($invites as $inv) {
            $email = strtolower(trim((string)($inv['email'] ?? '')));
            if ($email === '' || !str_contains($email, '@')) {
                $skipped++;
                $errors[] = ['email' => $email, 'reason' => 'invalid_email'];
                continue;
            }

            try {
                DB::table('employee_invitations')->insert([
                    'id'             => (string) Str::uuid(),
                    'company_id'     => $companyId,
                    'email'          => $email,
                    'full_name'      => $this->nullIfBlank($inv['full_name'] ?? null),
                    'position_id'    => $this->nullIfBlank($inv['position_id'] ?? null),
                    'department'     => $this->nullIfBlank($inv['department'] ?? null),
                    'requested_role' => $this->nullIfBlank($inv['requested_role'] ?? null) ?? 'employee',
                    'invited_by'     => $actor->id,
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
                $created++;
            } catch (Throwable $e) {
                $skipped++;
                $msg = $e->getMessage();
                $reason = str_contains($msg, 'duplicate key') || str_contains($msg, 'unique')
                    ? 'already_invited' : $msg;
                $errors[] = ['email' => $email, 'reason' => $reason];
            }
        }

        return ['created' => $created, 'skipped' => $skipped, 'errors' => $errors];
    }

    private function nullIfBlank(mixed $v): ?string
    {
        if ($v === null) return null;
        $t = trim((string)$v);
        return $t === '' ? null : $t;
    }
}
