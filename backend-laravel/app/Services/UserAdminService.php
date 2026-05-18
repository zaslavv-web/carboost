<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Batch 1: portage de verify_user / reject_user / delete_user / assign_role.
 *
 * Source PG: public.verify_user, reject_user, delete_user, assign_role
 * (SECURITY DEFINER). Toutes les vérifications de droits sont rejouées ici en PHP
 * pour ne plus dépendre d'auth.uid() côté Postgres.
 */
class UserAdminService
{
    private const ALLOWED_ROLES = ['employee', 'manager', 'hrd', 'company_admin'];

    public function verify(User $actor, string $targetId): void
    {
        $this->assertSuperOrCompanyAdmin($actor);
        $this->assertSameCompanyForAdmin($actor, $targetId, 'Company Admin can only verify users within their company');

        $requestedRole = DB::table('profiles')->where('user_id', $targetId)->value('requested_role');

        if ($requestedRole === 'superadmin' && !$actor->hasRole('superadmin')) {
            throw new RuntimeException('Только Суперадмин может подтверждать пользователя с ролью superadmin');
        }

        if (!$requestedRole || ($requestedRole !== 'superadmin' && !in_array($requestedRole, self::ALLOWED_ROLES, true))) {
            $requestedRole = 'employee';
        }

        DB::transaction(function () use ($targetId, $requestedRole) {
            DB::table('profiles')->where('user_id', $targetId)->update(['is_verified' => true]);
            DB::table('user_roles')->where('user_id', $targetId)->delete();
            DB::table('user_roles')->insert(['user_id' => $targetId, 'role' => $requestedRole]);
        });
    }

    public function reject(User $actor, string $targetId): void
    {
        $this->assertSuperOrCompanyAdmin($actor);
        $this->assertSameCompanyForAdmin($actor, $targetId, 'Company Admin can only reject users within their company');

        DB::transaction(function () use ($targetId) {
            DB::table('profiles')->where('user_id', $targetId)->delete();
            DB::table('user_roles')->where('user_id', $targetId)->delete();
        });
    }

    public function delete(User $actor, string $targetId): void
    {
        if (!$actor->hasRole('superadmin') && !$actor->hasRole('company_admin')) {
            throw new RuntimeException('Only Superadmin or Company Admin can delete users');
        }
        if ($actor->id === $targetId) {
            throw new RuntimeException('Cannot delete your own account');
        }
        if ($actor->hasRole('company_admin') && !$actor->hasRole('superadmin')) {
            $tgtCompany = DB::table('profiles')->where('user_id', $targetId)->value('company_id');
            if ($tgtCompany !== $actor->companyId()) {
                throw new RuntimeException('Company Admin can only delete users within their company');
            }
        }
        $tgtIsSuper = DB::table('user_roles')
            ->where('user_id', $targetId)->where('role', 'superadmin')->exists();
        if ($tgtIsSuper && !$actor->hasRole('superadmin')) {
            throw new RuntimeException('Cannot delete a superadmin user');
        }

        DB::transaction(function () use ($targetId) {
            DB::table('profiles')->where('user_id', $targetId)->delete();
            DB::table('user_roles')->where('user_id', $targetId)->delete();
            // CASCADE удалит зависимые записи через FK на auth.users
            DB::statement('DELETE FROM auth.users WHERE id = ?', [$targetId]);
        });
    }

    public function assignRole(User $actor, string $targetId, string $newRole): void
    {
        if (!$actor->hasRole('hrd') && !$actor->hasRole('superadmin') && !$actor->hasRole('company_admin')) {
            throw new RuntimeException('Только HRD, Администратор компании или Суперадмин могут назначать роли');
        }
        if ($newRole === 'superadmin' && !$actor->hasRole('superadmin')) {
            throw new RuntimeException('Только Суперадмин может назначать роль superadmin');
        }
        if (!$actor->hasRole('superadmin')) {
            $tgtCompany = DB::table('profiles')->where('user_id', $targetId)->value('company_id');
            $actorCompany = $actor->companyId();
            if (!$actorCompany || $tgtCompany !== $actorCompany) {
                throw new RuntimeException('Можно изменять роли только в своей компании');
            }
        }

        DB::transaction(function () use ($targetId, $newRole) {
            DB::table('user_roles')->where('user_id', $targetId)->delete();
            DB::table('user_roles')->insert(['user_id' => $targetId, 'role' => $newRole]);
        });
    }

    private function assertSuperOrCompanyAdmin(User $actor): void
    {
        if (!$actor->hasRole('superadmin') && !$actor->hasRole('company_admin')) {
            throw new RuntimeException('Only Superadmin or Company Admin can perform this action');
        }
    }

    private function assertSameCompanyForAdmin(User $actor, string $targetId, string $message): void
    {
        if ($actor->hasRole('company_admin') && !$actor->hasRole('superadmin')) {
            $tgtCompany = DB::table('profiles')->where('user_id', $targetId)->value('company_id');
            if ($tgtCompany !== $actor->companyId()) {
                throw new RuntimeException($message);
            }
        }
    }
}
