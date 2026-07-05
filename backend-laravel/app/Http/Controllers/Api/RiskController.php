<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Automation\RiskComputationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class RiskController extends Controller
{
    public function __construct(protected RiskComputationService $svc) {}

    protected function canManage(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hrd', 'company_admin', 'superadmin']);
    }

    public function recompute(Request $r)
    {
        if (! $this->canManage()) return response()->json(['error' => 'forbidden'], 403);
        $u = Auth::user();
        // FIX: User модель не хранит company_id напрямую — только через companyId() из profile.
        $companyId = (string) ($r->input('company_id') ?: (method_exists($u, 'companyId') ? $u->companyId() : '') ?: '');
        if (! $companyId) return response()->json(['error' => 'company_id required'], 422);

        $n = $this->svc->computeForCompany($companyId);
        return response()->json(['updated' => $n]);
    }
}
