<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeaveCompensation;
use App\Services\LeaveCalculatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveCompensationController extends Controller
{
    public function __construct(private LeaveCalculatorService $calc) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = LeaveCompensation::query();
        if (!$this->isHr($user)) {
            $query->where('user_id', $user->getAuthIdentifier());
        }
        if ($uid = $request->get('user_id')) $query->where('user_id', $uid);
        return response()->json($query->orderByDesc('created_at')->paginate(50));
    }

    public function calculate(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->isHr($user)) abort(403, 'Только HR может рассчитывать компенсацию');
        $data = $request->validate([
            'user_id'    => 'required|uuid',
            'daily_rate' => 'required|numeric|min:0',
            'currency'   => 'sometimes|string|max:8',
            'notes'      => 'nullable|string|max:1000',
        ]);
        $result = $this->calc->calculateCompensation($data['user_id'], (float) $data['daily_rate'], $data['currency'] ?? 'EUR');
        $rec = LeaveCompensation::create([
            'user_id'       => $data['user_id'],
            'unused_days'   => $result['unused_days'],
            'daily_rate'    => $data['daily_rate'],
            'total_amount'  => $result['total_amount'],
            'currency'      => $result['currency'],
            'calculated_at' => now(),
            'calculated_by' => $user->getAuthIdentifier(),
            'notes'         => $data['notes'] ?? null,
        ]);
        return response()->json($rec, 201);
    }

    public function markPaid(string $id, Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$this->isHr($user)) abort(403);
        $rec = LeaveCompensation::findOrFail($id);
        $rec->update(['paid_at' => now()]);
        return response()->json($rec->fresh());
    }

    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }
}
