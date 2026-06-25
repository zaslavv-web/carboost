<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
    ];


    public function upload(Request $request, string $bucket)
    {
        $cfg = self::cfg($bucket);
        $request->validate([
            'file' => 'required|file|max:51200', // 50 MB
            'path' => 'nullable|string|max:512',
            'upsert' => 'nullable|boolean',
        ]);

        $disk = Storage::disk($cfg[0]);
        $path = $request->input('path') ?: ($request->user()?->company_id ?? 'shared') . '/' .
                now()->format('YmdHis') . '_' . str()->random(8) . '.' . $request->file('file')->getClientOriginalExtension();

        if ($disk->exists($path) && ! $request->boolean('upsert')) {
            return response()->json(['error' => 'Файл по этому пути уже существует'], 409);
        }

        $stored = $disk->putFileAs(dirname($path), $request->file('file'), basename($path), $cfg[1] ? 'public' : 'private');

        return response()->json([
            'data' => [
                'path' => $stored,
                'fullPath' => $stored,
                'url' => $cfg[1] ? $disk->url($stored) : null,
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
}
