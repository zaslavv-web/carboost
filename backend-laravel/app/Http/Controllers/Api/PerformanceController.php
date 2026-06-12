<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PerformanceCycle;
use App\Models\PerformanceReview;
use App\Models\PerformanceReviewFeedback;
use App\Models\Profile;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Циклы оценки + индивидуальные performance reviews + 360° feedback.
 */
class PerformanceController extends Controller
{
    // ===== Cycles =====
    public function indexCycles(Request $request): JsonResponse
    {
        return response()->json(PerformanceCycle::query()->orderByDesc('period_start')->paginate(50));
    }

    public function storeCycle(Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        $data = $request->validate([
            'title'        => 'required|string|max:200',
            'period_start' => 'required|date',
            'period_end'   => 'required|date|after_or_equal:period_start',
            'deadline'     => 'nullable|date',
            'weights'      => 'nullable|array',
            'status'       => 'sometimes|in:draft,open,closed',
        ]);
        $cycle = PerformanceCycle::create($data + ['created_by' => $request->user()->getAuthIdentifier()]);
        return response()->json($cycle, 201);
    }

    public function updateCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        $cycle = PerformanceCycle::findOrFail($id);
        $cycle->update($request->only(['title','period_start','period_end','deadline','weights','status']));
        return response()->json($cycle);
    }

    public function openCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        $cycle = PerformanceCycle::findOrFail($id);

        return DB::transaction(function () use ($cycle, $request) {
            $cycle->update(['status' => 'open']);

            // Авто-создание reviews для всех сотрудников компании
            $employees = Profile::query()
                ->where('company_id', $cycle->company_id)
                ->where('is_active', true)
                ->get(['user_id']);

            foreach ($employees as $emp) {
                $managerId = TeamMember::query()
                    ->where('employee_id', $emp->user_id)
                    ->value('manager_id');
                PerformanceReview::firstOrCreate(
                    ['cycle_id' => $cycle->id, 'user_id' => $emp->user_id],
                    [
                        'company_id' => $cycle->company_id,
                        'manager_id' => $managerId,
                        'status'     => 'draft',
                    ],
                );
                $this->notify($emp->user_id, $cycle->company_id,
                    'Открыт цикл оценки: ' . $cycle->title,
                    'Заполните самооценку до ' . optional($cycle->deadline)->format('d.m.Y'),
                    'performance_review',
                );
            }

            return response()->json(['ok' => true, 'reviews_created' => count($employees)]);
        });
    }

    public function closeCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        $cycle = PerformanceCycle::findOrFail($id);
        $cycle->update(['status' => 'closed']);
        return response()->json($cycle);
    }

    // ===== Reviews =====
    public function indexReviews(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->get('scope', 'mine'); // mine|team|all
        $q = PerformanceReview::query()->with('cycle');

        if ($scope === 'mine') {
            $q->where('user_id', $user->getAuthIdentifier());
        } elseif ($scope === 'team') {
            $ids = TeamMember::where('manager_id', $user->getAuthIdentifier())->pluck('employee_id');
            $q->whereIn('user_id', $ids);
        } elseif ($scope === 'all' && !$this->isHr($user)) {
            abort(403);
        }
        if ($cycleId = $request->get('cycle_id')) $q->where('cycle_id', $cycleId);
        return response()->json($q->orderByDesc('created_at')->paginate(100));
    }

    public function showReview(string $id, Request $request): JsonResponse
    {
        $r = PerformanceReview::with(['cycle','feedback'])->findOrFail($id);
        $this->assertCanViewReview($request->user(), $r);
        return response()->json($r);
    }

    public function submitFeedback(string $reviewId, Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'role'              => 'required|in:self,manager,peer,subordinate',
            'competency_scores' => 'nullable|array',
            'overall_score'     => 'nullable|numeric|min:0|max:5',
            'strengths'         => 'nullable|string|max:5000',
            'improvements'      => 'nullable|string|max:5000',
            'comments'          => 'nullable|string|max:5000',
        ]);
        $review = PerformanceReview::findOrFail($reviewId);

        if ($data['role'] === 'self' && $review->user_id !== $user->getAuthIdentifier()) abort(403);
        if ($data['role'] === 'manager' && !$this->isManagerOf($user, $review->user_id) && !$this->isHr($user)) abort(403);

        $fb = PerformanceReviewFeedback::updateOrCreate(
            ['review_id' => $reviewId, 'reviewer_id' => $user->getAuthIdentifier(), 'role' => $data['role']],
            $data + ['submitted_at' => now()],
        );

        // Обновляем агрегаты в performance_reviews
        $review->refresh()->load('feedback');
        $update = [];
        if ($self = $review->feedback->firstWhere('role','self'))     $update['self_score']    = $self->overall_score;
        if ($mgr  = $review->feedback->firstWhere('role','manager'))  $update['manager_score'] = $mgr->overall_score;
        $peers = $review->feedback->where('role','peer');
        if ($peers->count()) $update['peer_score'] = round($peers->avg('overall_score'), 2);

        if (isset($update['self_score']) && $review->status === 'draft')    $update['status'] = 'self_done';
        if (isset($update['manager_score']) && $review->status !== 'finalized') $update['status'] = 'manager_done';
        $review->update($update);

        return response()->json(['feedback' => $fb, 'review' => $review->fresh('feedback')]);
    }

    public function finalize(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user()) && !$this->isManagerOf($request->user(), PerformanceReview::find($id)?->user_id ?? '')) {
            abort(403);
        }
        $data = $request->validate(['summary' => 'nullable|string|max:5000']);
        $review = PerformanceReview::with('cycle')->findOrFail($id);
        $w = $review->cycle->weights ?: ['self' => 0.2, 'manager' => 0.5, 'peer' => 0.3];
        $final = ((float)$review->self_score) * (float)($w['self'] ?? 0)
               + ((float)$review->manager_score) * (float)($w['manager'] ?? 0)
               + ((float)$review->peer_score) * (float)($w['peer'] ?? 0);
        $review->update([
            'final_score'  => round($final, 2),
            'summary'      => $data['summary'] ?? $review->summary,
            'status'       => 'finalized',
            'finalized_at' => now(),
        ]);
        $this->notify($review->user_id, $review->company_id,
            'Performance review закрыт',
            'Итоговая оценка: ' . round($final, 2),
            'performance_review',
        );
        return response()->json($review->fresh('feedback'));
    }

    // ===== helpers =====
    private function isHr($user): bool
    {
        return $user && ($user->hasRole('hrd') || $user->hasRole('company_admin') || $user->hasRole('superadmin'));
    }
    private function isManagerOf($user, string $employeeId): bool
    {
        if (!$user || !$employeeId) return false;
        return TeamMember::where('manager_id', $user->getAuthIdentifier())->where('employee_id', $employeeId)->exists();
    }
    private function assertCanViewReview($user, PerformanceReview $r): void
    {
        if ($r->user_id === $user->getAuthIdentifier()) return;
        if ($this->isHr($user)) return;
        if ($this->isManagerOf($user, $r->user_id)) return;
        abort(403);
    }
    private function notify(string $userId, ?string $companyId, string $title, string $description, string $type): void
    {
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $userId, 'company_id' => $companyId,
            'title' => $title, 'description' => $description,
            'notification_type' => $type, 'is_read' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
