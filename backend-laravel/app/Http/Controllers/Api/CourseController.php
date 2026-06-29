<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * CRUD курсов корпоративного университета.
 * Авторинг — HRD/company_admin/superadmin. Просмотр опубликованных — все сотрудники компании.
 */
class CourseController extends Controller
{
    protected function companyId(Request $r): ?string
    {
        $u = Auth::user();
        return (string) ($r->input('company_id') ?: $u?->company_id ?: '') ?: null;
    }

    protected function canAuthor(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hrd','company_admin','superadmin']);
    }

    public function index(Request $r)
    {
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);

        $q = DB::table('courses')->where('company_id', $cid);
        if (! $this->canAuthor()) $q->where('status', 'published');
        if ($status = $r->query('status')) $q->where('status', $status);

        $rows = $q->orderByDesc('updated_at')->get();
        return response()->json(['courses' => $rows]);
    }

    public function show(string $id)
    {
        $course = DB::table('courses')->where('id', $id)->first();
        if (! $course) return response()->json(['error' => 'not found'], 404);

        $modules = DB::table('course_modules')->where('course_id', $id)
            ->orderBy('order_index')->get()->map(function ($m) {
                $m->lessons = DB::table('lessons')->where('module_id', $m->id)
                    ->orderBy('order_index')->get();
                return $m;
            });

        return response()->json(['course' => $course, 'modules' => $modules]);
    }

    public function store(Request $r)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $cid = $this->companyId($r);
        if (! $cid) return response()->json(['error' => 'company_id required'], 422);

        $data = $r->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'level' => 'nullable|in:beginner,intermediate,advanced',
            'duration_min' => 'nullable|integer|min:0',
            'tags' => 'nullable|array',
            'competencies' => 'nullable|array',
            'mandatory' => 'nullable|boolean',
            'position_ids' => 'nullable|array',
            'position_ids.*' => 'uuid',
        ]);

        $id = (string) Str::uuid();
        DB::table('courses')->insert([
            'id' => $id,
            'company_id' => $cid,
            'title' => $data['title'],
            'slug' => Str::slug($data['title']) . '-' . substr($id, 0, 6),
            'description' => $data['description'] ?? null,
            'cover_url' => $data['cover_url'] ?? null,
            'level' => $data['level'] ?? 'beginner',
            'duration_min' => $data['duration_min'] ?? 0,
            'tags' => json_encode($data['tags'] ?? []),
            'competencies' => json_encode($data['competencies'] ?? []),
            'position_ids' => isset($data['position_ids']) ? json_encode($data['position_ids']) : null,
            'status' => 'draft',
            'mandatory' => $data['mandatory'] ?? false,
            'author_id' => Auth::id(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return response()->json(['id' => $id]);
    }


    public function update(Request $r, string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'cover_url' => 'nullable|string|max:500',
            'level' => 'nullable|in:beginner,intermediate,advanced',
            'duration_min' => 'nullable|integer|min:0',
            'tags' => 'nullable|array',
            'competencies' => 'nullable|array',
            'mandatory' => 'nullable|boolean',
            'status' => 'nullable|in:draft,published,archived',
            'position_ids' => 'nullable|array',
            'position_ids.*' => 'uuid',
        ]);
        if (isset($data['tags'])) $data['tags'] = json_encode($data['tags']);
        if (isset($data['competencies'])) $data['competencies'] = json_encode($data['competencies']);
        if (array_key_exists('position_ids', $data)) $data['position_ids'] = $data['position_ids'] ? json_encode($data['position_ids']) : null;
        $data['updated_at'] = now();
        DB::table('courses')->where('id', $id)->update($data);
        return response()->json(['ok' => true]);
    }


    public function destroy(string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        DB::table('courses')->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    // ---- Modules ----
    public function storeModule(Request $r, string $courseId)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate(['title' => 'required|string|max:255', 'order_index' => 'nullable|integer']);
        $id = (string) Str::uuid();
        DB::table('course_modules')->insert([
            'id' => $id, 'course_id' => $courseId,
            'order_index' => $data['order_index'] ?? (DB::table('course_modules')->where('course_id', $courseId)->count()),
            'title' => $data['title'],
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['id' => $id]);
    }

    public function updateModule(Request $r, string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate(['title' => 'sometimes|string', 'order_index' => 'sometimes|integer']);
        $data['updated_at'] = now();
        DB::table('course_modules')->where('id', $id)->update($data);
        return response()->json(['ok' => true]);
    }

    public function destroyModule(string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        DB::table('course_modules')->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }

    // ---- Lessons ----
    public function storeLesson(Request $r, string $moduleId)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate([
            'title' => 'required|string|max:255',
            'type' => 'required|in:video,markdown,pdf,test',
            'content' => 'nullable|string',
            'video_url' => 'nullable|string|max:500',
            'attachment_url' => 'nullable|string|max:500',
            'test_id' => 'nullable|uuid',
            'pass_score' => 'nullable|integer|min:0|max:100',
            'duration_min' => 'nullable|integer|min:0',
            'order_index' => 'nullable|integer',
        ]);
        $id = (string) Str::uuid();
        DB::table('lessons')->insert(array_merge([
            'id' => $id, 'module_id' => $moduleId,
            'order_index' => $data['order_index'] ?? DB::table('lessons')->where('module_id', $moduleId)->count(),
            'pass_score' => 70, 'duration_min' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ], $data));
        return response()->json(['id' => $id]);
    }

    public function updateLesson(Request $r, string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        $data = $r->validate([
            'title' => 'sometimes|string',
            'type' => 'sometimes|in:video,markdown,pdf,test',
            'content' => 'nullable|string',
            'video_url' => 'nullable|string',
            'attachment_url' => 'nullable|string',
            'test_id' => 'nullable|uuid',
            'pass_score' => 'sometimes|integer|min:0|max:100',
            'duration_min' => 'sometimes|integer|min:0',
            'order_index' => 'sometimes|integer',
        ]);
        $data['updated_at'] = now();
        DB::table('lessons')->where('id', $id)->update($data);
        return response()->json(['ok' => true]);
    }

    public function destroyLesson(string $id)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);
        DB::table('lessons')->where('id', $id)->delete();
        return response()->json(['ok' => true]);
    }
}
