<?php

namespace App\Policies;

use App\Models\DemoRequest;
use App\Models\User;

class DemoRequestPolicy extends BasePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasRole('superadmin');
    }

    public function view(User $user, DemoRequest $demoRequest): bool
    {
        return $user->hasRole('superadmin');
    }

    public function create(User $user): bool
    {
        return $user->hasRole('superadmin');
    }

    public function update(User $user, DemoRequest $demoRequest): bool
    {
        return $user->hasRole('superadmin');
    }

    public function delete(User $user, DemoRequest $demoRequest): bool
    {
        return $user->hasRole('superadmin');
    }
}