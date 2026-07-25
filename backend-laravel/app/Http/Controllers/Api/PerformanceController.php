<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use App\Models\PerformanceCycle;
use App\Models\PerformanceReview;
use App\Models\PerformanceReviewFeedback;
use App\Models\Profile;
use App\Models\TeamMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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
        $companyId = $this->currentCompanyId($request->user());
        if (!$companyId) {
            return response()->json([
                'ok' => false,
                'step' => 'resolve_company',
                'message' => 'Не указана компания для создания цикла оценки.',
            ], 422);
        }

        try {
            $id = (string) Str::uuid();
            $payload = $this->filterExistingColumns('performance_cycles', [
                'id' => $id,
                'company_id' => $companyId,
                'title' => $data['title'],
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
                'deadline' => $data['deadline'] ?? null,
                'weights' => isset($data['weights']) ? json_encode($data['weights'], JSON_UNESCAPED_UNICODE) : null,
                'status' => $data['status'] ?? 'draft',
                'created_by' => $request->user()->getAuthIdentifier(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('performance_cycles')->insert($payload);

            $cycle = DB::table('performance_cycles')->where('id', $id)->first();
            return response()->json($this->decodeJsonFields($cycle, ['weights']), 201);
        } catch (\Throwable $e) {
            return $this->diagnosticError('store_cycle', $e, [
                'schema' => $this->performanceSchemaDiagnostics(),
                'company_id' => $companyId,
            ]);
        }
    }

    public function updateCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        try {
            $payload = $this->filterExistingColumns('performance_cycles', $request->only(['title','period_start','period_end','deadline','weights','status']));
            if (array_key_exists('weights', $payload) && is_array($payload['weights'])) {
                $payload['weights'] = json_encode($payload['weights'], JSON_UNESCAPED_UNICODE);
            }
            if (Schema::hasColumn('performance_cycles', 'updated_at')) {
                $payload['updated_at'] = now();
            }
            if ($payload) {
                DB::table('performance_cycles')->where('id', $id)->update($payload);
            }
            $cycle = DB::table('performance_cycles')->where('id', $id)->first();
            if (!$cycle) abort(404);
            return response()->json($this->decodeJsonFields($cycle, ['weights']));
        } catch (\Throwable $e) {
            return $this->diagnosticError('update_cycle', $e, ['cycle_id' => $id]);
        }
    }

    public function openCyclePreflight(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);

        $cycle = DB::table('performance_cycles')->where('id', $id)->first();
        if (!$cycle) abort(404);

        $companyId = $cycle->company_id ?? $this->currentCompanyId($request->user());
        $employees = $this->cycleEmployees($companyId);

        return response()->json([
            'ok' => true,
            'cycle_id' => $id,
            'company_id' => $companyId,
            'employees_count' => $employees->count(),
            'existing_reviews' => $this->countExistingReviews($id),
            'schema' => $this->performanceSchemaDiagnostics(),
            'notifications_schema' => $this->tableColumns('notifications'),
        ]);
    }

    public function openCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);

        $cycle = null;
        $created = 0;
        $existing = 0;
        $reviewErrors = [];
        $notificationErrors = [];

        try {
            $cycle = DB::table('performance_cycles')->where('id', $id)->first();
            if (!$cycle) abort(404);

            $missing = $this->missingRequiredColumns([
                'performance_cycles' => ['id', 'status'],
                'profiles' => ['user_id', 'company_id'],
                'performance_reviews' => ['id', 'cycle_id', 'user_id', 'status'],
            ]);
            if ($missing) {
                return response()->json([
                    'ok' => false,
                    'step' => 'schema_preflight',
                    'message' => 'В схеме базы не хватает обязательных колонок для открытия цикла оценки.',
                    'diagnostics' => ['missing_columns' => $missing, 'schema' => $this->performanceSchemaDiagnostics()],
                ], 500);
            }

            $companyId = $cycle->company_id ?? $this->currentCompanyId($request->user());
            if (!$companyId) {
                return response()->json([
                    'ok' => false,
                    'step' => 'resolve_company',
                    'message' => 'У цикла оценки не указана компания.',
                    'diagnostics' => ['cycle_id' => $id, 'cycle_company_id' => $cycle->company_id ?? null],
                ], 422);
            }

            $cycleUpdate = $this->filterExistingColumns('performance_cycles', [
                'status' => 'open',
                'company_id' => $companyId,
                'updated_at' => now(),
            ]);
            DB::table('performance_cycles')->where('id', $id)->update($cycleUpdate);

            $employees = $this->cycleEmployees($companyId);

            foreach ($employees as $emp) {
                $userId = (string) ($emp->user_id ?? '');
                if ($userId === '') {
                    continue;
                }

                try {
                    $managerId = Schema::hasTable('team_members') && Schema::hasColumn('team_members', 'employee_id') && Schema::hasColumn('team_members', 'manager_id')
                        ? DB::table('team_members')->where('employee_id', $userId)->value('manager_id')
                        : null;

                    $alreadyExists = DB::table('performance_reviews')
                        ->where('cycle_id', $id)
                        ->where('user_id', $userId)
                        ->exists();

                    if ($alreadyExists) {
                        $existing++;
                    } else {
                        $reviewPayload = $this->filterExistingColumns('performance_reviews', [
                            'id' => (string) Str::uuid(),
                            'cycle_id' => $id,
                            'user_id' => $userId,
                            'company_id' => $companyId,
                            'manager_id' => $managerId,
                            'status' => 'draft',
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                        DB::table('performance_reviews')->insert($reviewPayload);
                        $created++;
                    }
                } catch (\Throwable $e) {
                    $reviewErrors[] = ['user_id' => $userId, 'error' => $e->getMessage()];
                    continue;
                }

                try {
                    $deadline = $this->formatNullableDate($cycle->deadline ?? null);
                    $notificationError = $this->notify($userId, $companyId,
                        'Открыт цикл оценки: ' . ($cycle->title ?? 'Performance review'),
                        'Заполните самооценку' . ($deadline ? ' до ' . $deadline : ''),
                        'performance_review',
                    );

                    if ($notificationError) {
                        $notificationErrors[] = ['user_id' => $userId, 'error' => $notificationError];
                    }
                } catch (\Throwable $e) {
                    $notificationErrors[] = ['user_id' => $userId, 'error' => $e->getMessage()];
                }
            }
        } catch (\Throwable $e) {
            return $this->diagnosticError('open_cycle', $e, [
                'cycle_id' => $id,
                'cycle_company_id' => $cycle->company_id ?? null,
                'created' => $created,
                'existing' => $existing,
                'review_errors' => $reviewErrors,
                'notification_errors' => $notificationErrors,
                'schema' => $this->performanceSchemaDiagnostics(),
            ]);
        }

        return response()->json([
            'ok' => true,
            'reviews_created' => $created,
            'reviews_existing' => $existing,
            'review_errors' => $reviewErrors,
            'notification_errors' => $notificationErrors,
        ]);

    }

    public function closeCycle(string $id, Request $request): JsonResponse
    {
        if (!$this->isHr($request->user())) abort(403);
        try {
            $payload = $this->filterExistingColumns('performance_cycles', [
                'status' => 'closed',
                'updated_at' => now(),
            ]);
            DB::table('performance_cycles')->where('id', $id)->update($payload);
            $cycle = DB::table('performance_cycles')->where('id', $id)->first();
            if (!$cycle) abort(404);
            return response()->json($this->decodeJsonFields($cycle, ['weights']));
        } catch (\Throwable $e) {
            return $this->diagnosticError('close_cycle', $e, ['cycle_id' => $id]);
        }
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
        if (Schema::hasColumn('performance_reviews', 'created_at')) {
            $q->orderByDesc('created_at');
        } else {
            $q->orderByDesc('id');
        }
        return response()->json($q->paginate(100));
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

        try {
            $fb = PerformanceReviewFeedback::updateOrCreate(
                ['review_id' => $reviewId, 'reviewer_id' => $user->getAuthIdentifier(), 'role' => $data['role']],
                $data + ['submitted_at' => now()],
            );
        } catch (\Throwable $e) {
            return $this->diagnosticError('submit_feedback', $e, ['review_id' => $reviewId]);
        }

        // Обновляем агрегаты в performance_reviews
        $review->refresh()->load('feedback');
        $update = [];
        if ($self = $review->feedback->firstWhere('role','self'))     $update['self_score']    = $self->overall_score;
        if ($mgr  = $review->feedback->firstWhere('role','manager'))  $update['manager_score'] = $mgr->overall_score;
        $peers = $review->feedback->where('role','peer');
        if ($peers->count()) $update['peer_score'] = round($peers->avg('overall_score'), 2);

        if (isset($update['self_score']) && $review->status === 'draft')    $update['status'] = 'self_done';
        if (isset($update['manager_score']) && $review->status !== 'finalized') $update['status'] = 'manager_done';
        if ($update) {
            $safeUpdate = $this->filterExistingColumns('performance_reviews', $update + ['updated_at' => now()]);
            DB::table('performance_reviews')->where('id', $review->id)->update($safeUpdate);
        }

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
        $payload = $this->filterExistingColumns('performance_reviews', [
            'final_score'  => round($final, 2),
            'summary'      => $data['summary'] ?? $review->summary,
            'status'       => 'finalized',
            'finalized_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('performance_reviews')->where('id', $review->id)->update($payload);
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
        if (!Schema::hasTable('team_members') || !Schema::hasColumn('team_members', 'manager_id') || !Schema::hasColumn('team_members', 'employee_id')) {
            return false;
        }
        return DB::table('team_members')->where('manager_id', $user->getAuthIdentifier())->where('employee_id', $employeeId)->exists();
    }
    private function assertCanViewReview($user, PerformanceReview $r): void
    {
        if ($r->user_id === $user->getAuthIdentifier()) return;
        if ($this->isHr($user)) return;
        if ($this->isManagerOf($user, $r->user_id)) return;
        abort(403);
    }
    private function notify(string $userId, ?string $companyId, string $title, string $description, string $type): ?string
    {
        if (!Schema::hasTable('notifications')) {
            return 'notifications table does not exist';
        }

        $payload = $this->filterExistingColumns('notifications', [
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'company_id' => $companyId,
            'title' => $title,
            'description' => $description,
            'message' => $description,
            'notification_type' => $type,
            'type' => $type,
            'is_read' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('notifications')->insert($payload);

        return null;
    }

    private function currentCompanyId($user): ?string
    {
        if (!$user) return null;
        try {
            if (method_exists($user, 'companyId')) {
                $companyId = $user->companyId();
                if ($companyId) return (string) $companyId;
            }
        } catch (\Throwable) {
            // fall through
        }
        $userId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->getAuthIdentifier();
        if (Schema::hasTable('profiles') && Schema::hasColumn('profiles', 'company_id') && Schema::hasColumn('profiles', 'user_id')) {
            $companyId = DB::table('profiles')->where('user_id', $userId)->value('company_id');
            return $companyId ? (string) $companyId : null;
        }
        return null;
    }

    private function cycleEmployees(?string $companyId)
    {
        if (!$companyId || !Schema::hasTable('profiles') || !Schema::hasColumn('profiles', 'user_id')) {
            return collect();
        }
        $query = DB::table('profiles')->whereNotNull('user_id');
        if (Schema::hasColumn('profiles', 'company_id')) {
            $query->where('company_id', $companyId);
        }
        return $query->get(['user_id']);
    }

    private function countExistingReviews(string $cycleId): int
    {
        if (!Schema::hasTable('performance_reviews') || !Schema::hasColumn('performance_reviews', 'cycle_id')) {
            return 0;
        }
        return DB::table('performance_reviews')->where('cycle_id', $cycleId)->count();
    }

    private function filterExistingColumns(string $table, array $payload): array
    {
        if (!Schema::hasTable($table)) return [];
        return collect($payload)
            ->filter(fn ($value, $column) => Schema::hasColumn($table, (string) $column))
            ->all();
    }

    private function missingRequiredColumns(array $requirements): array
    {
        $missing = [];
        foreach ($requirements as $table => $columns) {
            if (!Schema::hasTable($table)) {
                $missing[$table] = ['__table__'];
                continue;
            }
            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) {
                    $missing[$table][] = $column;
                }
            }
        }
        return $missing;
    }

    private function tableColumns(string $table): array
    {
        if (!Schema::hasTable($table)) return [];
        try {
            return Schema::getColumnListing($table);
        } catch (\Throwable) {
            return [];
        }
    }

    private function performanceSchemaDiagnostics(): array
    {
        return [
            'performance_cycles' => $this->tableColumns('performance_cycles'),
            'performance_reviews' => $this->tableColumns('performance_reviews'),
            'performance_review_feedback' => $this->tableColumns('performance_review_feedback'),
            'profiles' => $this->tableColumns('profiles'),
            'team_members' => $this->tableColumns('team_members'),
            'notifications' => $this->tableColumns('notifications'),
        ];
    }

    private function diagnosticError(string $step, \Throwable $e, array $diagnostics = []): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'step' => $step,
            'message' => $e->getMessage(),
            'diagnostics' => $diagnostics,
        ], 500);
    }

    private function formatNullableDate($value): ?string
    {
        if (!$value) return null;
        try {
            return Carbon::parse($value)->format('d.m.Y');
        } catch (\Throwable) {
            return null;
        }
    }

    private function decodeJsonFields($row, array $fields)
    {
        if (!$row) return $row;
        foreach ($fields as $field) {
            if (isset($row->{$field}) && is_string($row->{$field})) {
                $decoded = json_decode($row->{$field}, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $row->{$field} = $decoded;
                }
            }
        }
        return $row;
    }
}
