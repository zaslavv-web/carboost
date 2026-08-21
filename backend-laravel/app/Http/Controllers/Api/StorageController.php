<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Storage bridge (Phase 11).
 *
 * Drop-in replacement for `legacy.storage.from(bucket).upload/createSignedUrl/remove`.
 * Each legacy bucket maps 1:1 to a Laravel filesystem disk configured in
 * `config/filesystems.php` (overlayed). Public buckets use the `public`
 * driver visibility and return permanent URLs; private ones return temporary
 * signed URLs.
 */
class StorageController extends Controller
{
    /**
     * bucket => [disk, public]
     */
    protected const BUCKETS = [
        'avatars'                 => ['avatars',                true],
        'reward-images'           => ['reward-images',          true],
        'shop-products'           => ['shop-products',          true],
        'hr-documents'            => ['hr-documents',           false],
        'hrd-tests'               => ['hrd-tests',              false],
        'employee-questionnaires' => ['employee-questionnaires', false],
        'career-submissions'     => ['career-submissions',     false],
        'tracker-attachments'    => ['tracker-attachments',    false],
        'scorm-packages'          => ['scorm-packages',          false],
        'content-media'           => ['content-media',           false],
    ];


    public function upload(Request $request, string $bucket)
    {
        $cfg = self::cfg($bucket);
        $rules = [
            'file' => 'required|file|max:51200', // 50 MB
            'path' => 'nullable|string|max:512',
            'upsert' => 'nullable|boolean',
        ];
        if ($bucket === 'content-media') {
            $rules['file'] = 'required|file|max:51200|mimetypes:image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
            if (! $this->canPublishContent($request)) return response()->json(['error' => 'forbidden'], 403);
        }
        $request->validate($rules);

        $disk = Storage::disk($cfg[0]);
        $companyId = $request->user()?->companyId();
        $path = $request->input('path') ?: ($companyId ?? 'shared') . '/' .
                now()->format('YmdHis') . '_' . str()->random(8) . '.' . $request->file('file')->getClientOriginalExtension();
        if ($bucket === 'content-media') {
            if (! $companyId) return response()->json(['error' => 'company_id required'], 422);
            $requested = ltrim(str_replace('..', '', (string) $request->input('path', '')), '/');
            $path = $companyId . '/' . ($requested ?: Str::uuid() . '.' . $request->file('file')->getClientOriginalExtension());
        }

        if ($disk->exists($path) && ! $request->boolean('upsert')) {
            return response()->json(['error' => 'Файл по этому пути уже существует'], 409);
        }

        $stored = $disk->putFileAs(dirname($path), $request->file('file'), basename($path), $cfg[1] ? 'public' : 'private');

        return response()->json([
            'data' => [
                'path' => $stored,
                'fullPath' => $stored,
                'url' => $cfg[1] ? $disk->url($stored) : ($bucket === 'content-media' ? $this->contentUrl($stored) : null),
            ],
        ]);
    }

    public function sign(Request $request, string $bucket)
    {
        $cfg = self::cfg($bucket);
        $path = (string) $request->query('path', '');
        $ttl  = (int) $request->query('ttl', 600);
        if ($path === '') {
            return response()->json(['error' => 'Не указан путь'], 422);
        }

        $disk = Storage::disk($cfg[0]);
        if ($cfg[1]) {
            return response()->json(['data' => ['signedUrl' => $disk->url($path)]]);
        }
        $url = $disk->temporaryUrl($path, now()->addSeconds($ttl));
        return response()->json(['data' => ['signedUrl' => $url]]);
    }

    public function destroy(Request $request, string $bucket)
    {
        $cfg = self::cfg($bucket);
        $paths = (array) $request->input('paths', []);
        if (! $paths) {
            return response()->json(['error' => 'Список путей пуст'], 422);
        }
        Storage::disk($cfg[0])->delete($paths);
        return response()->json(['data' => ['deleted' => count($paths)]]);
    }

    protected static function cfg(string $bucket): array
    {
        if (! isset(self::BUCKETS[$bucket])) {
            abort(response()->json(['error' => "Бакет '$bucket' не зарегистрирован"], 404));
        }
        return self::BUCKETS[$bucket];
    }

    public function content(Request $request, string $path)
    {
        $path = ltrim($path, '/');
        $sig = (string) $request->query('sig', '');
        if ($path === '' || str_contains($path, '..') || ! hash_equals($this->contentSignature($path), $sig)) {
            return response()->json(['error' => 'forbidden'], 403);
        }
        $disk = Storage::disk('content-media');
        if (! $disk->exists($path)) return response()->json(['error' => 'not found'], 404);
        return response()->file($disk->path($path), [
            'Content-Type' => $disk->mimeType($path) ?: 'application/octet-stream',
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function canPublishContent(Request $request): bool
    {
        $user = $request->user();
        if (! $user) return false;
        $roles = DB::table('user_roles')->where('user_id', $user->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr', 'hrd', 'company_admin', 'manager', 'superadmin']);
    }

    private function contentUrl(string $path): string
    {
        return url('/api/content-media/' . $path) . '?sig=' . $this->contentSignature($path);
    }

    private function contentSignature(string $path): string
    {
        return hash_hmac('sha256', $path, (string) config('app.key'));
    }
}
