<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * SCORM 1.2 / 2004 package upload, import, launch and runtime data (cmi).
 */
class ScormController extends Controller
{
    protected const MAX_ZIP_MB = 100;

    protected function uid(): ?string { return (string) (Auth::id() ?: '') ?: null; }

    protected function canAuthor(): bool
    {
        $u = Auth::user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr','hrd','company_admin','superadmin']);
    }

    protected function companyId(): ?string
    {
        $u = Auth::user();
        return $u?->companyId() ?: null;
    }

    /**
     * STEP 1: Upload and unpack a SCORM ZIP package.
     * Returns a temporary upload token (path) used by import.
     */
    public function upload(Request $r)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);

        $r->validate([
            'file' => [
                'required',
                'file',
                'max:' . (self::MAX_ZIP_MB * 1024),
                'mimetypes:application/zip,application/x-zip-compressed,application/x-zip,multipart/x-zip,application/octet-stream',
            ],
        ], [
            'file.required' => 'Файл не выбран.',
            'file.max'      => 'Файл больше ' . self::MAX_ZIP_MB . ' МБ.',
            'file.mimetypes' => 'Ожидается ZIP-архив SCORM.',
        ]);

        $upload = $r->file('file');
        if (strtolower((string) $upload->getClientOriginalExtension()) !== 'zip') {
            return response()->json(['error' => 'Ожидается файл с расширением .zip'], 422);
        }


        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company_id required'], 422);

        $file = $r->file('file');
        $uuid = (string) Str::uuid();
        $base = $companyId . '/' . $uuid;
        $zipPath = $base . '/package.zip';

        $disk = Storage::disk('scorm-packages');
        $disk->putFileAs($base, $file, 'package.zip', 'private');

        // Unpack
        $localZip = $disk->path($zipPath);
        $extractTo = $disk->path($base);
        $zip = new ZipArchive();
        if ($zip->open($localZip) !== true) {
            $disk->delete($zipPath);
            return response()->json(['error' => 'cannot open zip'], 400);
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (str_contains($name, '..') || str_starts_with($name, '/')) {
                $zip->close();
                $disk->deleteDirectory($base);
                return response()->json(['error' => 'invalid zip entry: ' . $name], 400);
            }
        }
        $zip->extractTo($extractTo);
        $zip->close();

        // Locate imsmanifest.xml
        $manifestRel = $this->locateManifest($disk, $base);
        if (! $manifestRel) {
            $disk->deleteDirectory($base);
            return response()->json(['error' => 'imsmanifest.xml not found'], 400);
        }

        return response()->json([
            'upload_token' => $uuid,
            'package_path' => $base,
            'manifest_path' => $manifestRel,
        ]);
    }

    /**
     * STEP 2: Parse manifest and create a course with modules/lessons.
     */
    public function import(Request $r)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);

        $data = $r->validate([
            'upload_token' => 'required|string',
            'title' => 'nullable|string|max:255',
            'description' => 'nullable|string',
        ]);

        $companyId = $this->companyId();
        if (! $companyId) return response()->json(['error' => 'company_id required'], 422);

        $base = $companyId . '/' . $data['upload_token'];
        $disk = Storage::disk('scorm-packages');
        $manifestRel = $this->locateManifest($disk, $base);
        if (! $manifestRel) {
            return response()->json(['error' => 'upload token invalid or expired'], 404);
        }

        $manifestPath = $disk->path($base . '/' . $manifestRel);
        $manifestXml = @file_get_contents($manifestPath);
        if (! $manifestXml) {
            return response()->json(['error' => 'cannot read manifest'], 500);
        }

        $manifest = $this->parseManifest($manifestXml);
        if (! $manifest) {
            return response()->json(['error' => 'invalid imsmanifest.xml'], 400);
        }

        $courseId = (string) Str::uuid();
        $title = $data['title'] ?? ($manifest['title'] ?: 'SCORM курс');

        DB::transaction(function () use ($companyId, $courseId, $title, $data, $base, $manifest) {
            DB::table('courses')->insert([
                'id' => $courseId,
                'company_id' => $companyId,
                'title' => $title,
                'slug' => Str::slug($title) . '-' . substr($courseId, 0, 6),
                'description' => $data['description'] ?? null,
                'level' => 'beginner',
                'duration_min' => 0,
                'status' => 'draft',
                'mandatory' => false,
                'source_type' => 'scorm',
                'scorm_version' => $manifest['version'],
                'scorm_package_path' => $base,
                'scorm_manifest' => json_encode($manifest),
                'author_id' => Auth::id(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $order = 0;
            foreach ($manifest['items'] as $item) {
                $moduleId = (string) Str::uuid();
                DB::table('course_modules')->insert([
                    'id' => $moduleId,
                    'course_id' => $courseId,
                    'order_index' => $order++,
                    'title' => $item['title'] ?: 'Модуль ' . $order,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $lessonId = (string) Str::uuid();
                DB::table('lessons')->insert([
                    'id' => $lessonId,
                    'module_id' => $moduleId,
                    'order_index' => 0,
                    'type' => 'scorm',
                    'title' => $item['title'] ?: 'Урок',
                    'content' => null,
                    'launch_url' => $item['href'],
                    'pass_score' => 70,
                    'duration_min' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });

        return response()->json(['course_id' => $courseId, 'title' => $title]);
    }

    /**
     * Serve a launch page for a SCORM lesson.
     * The page injects the SCORM API adapter and loads the SCO in an iframe.
     */
    public function launch(Request $r, string $courseId, string $lessonId)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $course = DB::table('courses')->where('id', $courseId)->first();
        if (! $course || $course->source_type !== 'scorm') {
            return response()->json(['error' => 'not found'], 404);
        }

        $lesson = DB::table('lessons')->where('id', $lessonId)->where('module_id', function ($q) use ($courseId) {
            $q->select('id')->from('course_modules')->where('course_id', $courseId);
        })->first();
        if (! $lesson) return response()->json(['error' => 'lesson not found'], 404);

        // Enrollment check: either the user is enrolled or is an author.
        $enrollment = DB::table('enrollments')
            ->where('course_id', $courseId)
            ->where('user_id', $uid)
            ->first();

        if (! $enrollment && ! $this->canAuthor()) {
            return response()->json(['error' => 'not enrolled'], 403);
        }

        $enrollmentId = $enrollment?->id;
        $version = $course->scorm_version === '2004' ? '2004' : '1.2';
        $launchUrl = $this->assetUrl($course->scorm_package_path, $lesson->launch_url);

        $html = $this->launchHtml($launchUrl, $enrollmentId, $lessonId, $version);
        return new Response($html, 200, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    /**
     * Store cmi data coming from the SCORM content.
     */
    public function storeCmi(Request $r, string $enrollmentId)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $enrollment = DB::table('enrollments')
            ->where('id', $enrollmentId)
            ->where('user_id', $uid)
            ->first();
        if (! $enrollment) return response()->json(['error' => 'not found'], 404);

        $data = $r->validate(['cmi' => 'required|array']);
        $cmi = $data['cmi'];

        foreach ($cmi as $key => $value) {
            DB::table('scorm_runtime_data')->updateOrInsert(
                ['enrollment_id' => $enrollmentId, 'lesson_id' => $r->input('lesson_id', ''), 'cmi_key' => $key],
                ['cmi_value' => is_string($value) ? $value : json_encode($value), 'updated_at' => now(), 'created_at' => now()]
            );
        }

        // Detect completion
        $status = $this->extractCompletionStatus($cmi, $enrollment->course_id);
        if ($status === 'completed' || $status === 'passed') {
            $lessonId = $r->input('lesson_id');
            if ($lessonId) {
                DB::table('lesson_progress')->updateOrInsert(
                    ['enrollment_id' => $enrollmentId, 'lesson_id' => $lessonId],
                    ['completed' => true, 'score' => $this->extractScore($cmi), 'updated_at' => now(), 'created_at' => now()]
                );
                $this->checkCourseCompletion($enrollmentId, $enrollment->course_id);
            }
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Retrieve previously stored cmi data for a lesson.
     */
    public function getCmi(Request $r, string $enrollmentId)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $enrollment = DB::table('enrollments')
            ->where('id', $enrollmentId)
            ->where('user_id', $uid)
            ->first();
        if (! $enrollment) return response()->json(['error' => 'not found'], 404);

        $lessonId = $r->query('lesson_id');
        $q = DB::table('scorm_runtime_data')->where('enrollment_id', $enrollmentId);
        if ($lessonId) $q->where('lesson_id', $lessonId);

        $rows = $q->get(['cmi_key', 'cmi_value']);
        $cmi = [];
        foreach ($rows as $row) {
            $cmi[$row->cmi_key] = $row->cmi_value;
        }
        return response()->json(['cmi' => $cmi]);
    }

    // ------------------------------------------------------------------

    protected function locateManifest($disk, string $base): ?string
    {
        // Возвращаем путь относительно $base.
        $basePath = $disk->path($base);
        foreach ($disk->files($base) as $f) {
            if (basename($f) === 'imsmanifest.xml') {
                return ltrim(str_replace($basePath, '', $disk->path($f)), '/');
            }
        }
        foreach ($disk->allFiles($base) as $f) {
            if (basename($f) === 'imsmanifest.xml') {
                return ltrim(str_replace($basePath, '', $disk->path($f)), '/');
            }
        }
        return null;
    }

    protected function parseManifest(string $xml): ?array
    {
        libxml_use_internal_errors(true);
        $doc = simplexml_load_string($xml);
        if (! $doc) return null;

        $ns = $doc->getNamespaces(true);
        $version = '1.2';
        $schema = strtolower(trim((string) ($doc->schemaversion ?? '')));
        if (str_contains($schema, '2004')) $version = '2004';

        // Title from metadata or first organization
        $title = '';
        $manifestNs = $doc;
        if (isset($ns[''])) {
            $manifestNs = $doc->children($ns['']);
        }

        $organizations = $manifestNs->organizations ?? $doc->organizations;
        $organization = $organizations->organization ?? null;
        if (! $organization && isset($organizations[0])) $organization = $organizations[0];

        if ($organization) {
            $title = trim((string) ($organization->title ?? ''));
        }
        if (! $title) {
            $title = trim((string) ($manifestNs->metadata->lom->general->title->langstring ??
                $manifestNs->metadata->lom->general->title->string ?? ''));
        }

        $items = [];
        if ($organization) {
            foreach ($organization->item as $item) {
                $this->walkItems($item, $items, $manifestNs, $ns);
            }
        }

        return ['version' => $version, 'title' => $title, 'items' => $items];
    }

    protected function walkItems($item, array &$out, $manifestNs, array $ns, string $prefix = '')
    {
        $identifierref = (string) ($item['identifierref'] ?? '');
        $title = trim((string) ($item->title ?? ''));
        $href = '';

        if ($identifierref) {
            $resources = $manifestNs->resources ?? null;
            if ($resources) {
                foreach ($resources->resource as $res) {
                    if ((string) ($res['identifier'] ?? '') === $identifierref) {
                        $href = (string) ($res['href'] ?? '');
                        break;
                    }
                }
            }
        }

        if ($href) {
            $out[] = ['title' => ($prefix ? $prefix . ' / ' : '') . $title, 'href' => $href];
        }

        foreach ($item->item as $child) {
            $this->walkItems($child, $out, $manifestNs, $ns, ($prefix ? $prefix . ' / ' : '') . $title);
        }
    }

    protected function assetUrl(string $packagePath, string $relative): string
    {
        $relative = ltrim($relative, '/');
        return url('/api/university/scorm/asset/' . ltrim($packagePath, '/') . '/' . $relative);
    }

    /**
     * Serve a single SCORM asset (html, js, images) with enrollment/auth guard.
     */
    public function asset(Request $r)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $path = (string) $r->route('path', '');
        if (! $path || str_contains($path, '..')) return response()->json(['error' => 'invalid path'], 400);

        // Извлекаем package_path как первые два сегмента (company_id/uuid).
        $segments = explode('/', $path);
        $packagePath = implode('/', array_slice($segments, 0, 2));
        if (! $packagePath || count($segments) < 2) {
            return response()->json(['error' => 'invalid path'], 400);
        }

        // Verify the path belongs to an enrolled course or authored course.
        $companyId = $this->companyId();
        $allowed = DB::table('courses')
            ->where('scorm_package_path', $packagePath)
            ->where(function ($q) use ($uid, $companyId) {
                $q->whereExists(function ($sq) use ($uid) {
                    $sq->selectRaw('1')->from('enrollments')
                       ->whereColumn('enrollments.course_id', 'courses.id')
                       ->where('enrollments.user_id', $uid);
                });
                if ($companyId) {
                    $q->orWhere('author_id', $uid);
                }
            })
            ->exists();

        if (! $allowed) return response()->json(['error' => 'forbidden'], 403);

        $disk = Storage::disk('scorm-packages');
        $full = $disk->path($path);
        if (! file_exists($full) || is_dir($full)) {
            return response()->json(['error' => 'not found'], 404);
        }

        $mime = mime_content_type($full) ?: 'application/octet-stream';
        return response()->file($full, ['Content-Type' => $mime]);
    }

    protected function launchHtml(string $launchUrl, ?string $enrollmentId, string $lessonId, string $version): string
    {
        $api = $version === '2004' ? 'API_1484_11' : 'API';
        $postUrl = url('/api/university/scorm/' . ($enrollmentId ?: 'none') . '/cmi');
        $getUrl = url('/api/university/scorm/' . ($enrollmentId ?: 'none') . '/cmi?lesson_id=' . $lessonId);

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SCORM launcher</title>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0f172a}
  iframe{border:0;width:100%;height:100%}
  #bar{position:fixed;top:0;left:0;right:0;height:40px;background:#1b1d22;color:#d5a52a;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-family:Inter,sans-serif;font-size:13px;z-index:1000}
  #wrap{position:fixed;top:40px;left:0;right:0;bottom:0}
</style>
</head>
<body>
<div id="bar"><span>Пик Роста · SCORM {$version}</span><span id="status">Загрузка…</span></div>
<div id="wrap"><iframe id="sco" src="{$launchUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>
<script>
(function(){
  const version = '{$version}';
  const postUrl = '{$postUrl}';
  const getUrl = '{$getUrl}';
  const lessonId = '{$lessonId}';
  const enrollmentId = '{$enrollmentId}';
  const statusEl = document.getElementById('status');
  let initialized = false;
  let cmi = {};

  async function loadCmi() {
    if (!enrollmentId || enrollmentId === 'none') return;
    try {
      const r = await fetch(getUrl, {credentials:'include'});
      if (r.ok) { const j = await r.json(); cmi = j.cmi || {}; }
    } catch(e){}
  }

  function setStatus(s){ statusEl.textContent = s; }

  function postCmi(delta) {
    if (!enrollmentId || enrollmentId === 'none') return Promise.resolve();
    return fetch(postUrl, {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({lesson_id: lessonId, cmi: delta})
    });
  }

  function api12() {
    return {
      LMSInitialize: function(param) {
        initialized = true; setStatus('Активно'); loadCmi(); return 'true';
      },
      LMSFinish: function(param) {
        initialized = false; setStatus('Завершено');
        postCmi(cmi);
        return 'true';
      },
      LMSGetValue: function(key) { return cmi[key] !== undefined ? cmi[key] : ''; },
      LMSSetValue: function(key, value) {
        cmi[key] = String(value);
        const delta = {}; delta[key] = value;
        postCmi(delta).catch(()=>{});
        return 'true';
      },
      LMSCommit: function(param) { postCmi(cmi); return 'true'; },
      LMSGetLastError: function() { return '0'; },
      LMSGetErrorString: function() { return ''; },
      LMSGetDiagnostic: function() { return ''; }
    };
  }

  function api2004() {
    return {
      Initialize: function(param) {
        initialized = true; setStatus('Активно'); loadCmi(); return 'true';
      },
      Terminate: function(param) {
        initialized = false; setStatus('Завершено');
        postCmi(cmi);
        return 'true';
      },
      GetValue: function(key) { return cmi[key] !== undefined ? cmi[key] : ''; },
      SetValue: function(key, value) {
        cmi[key] = String(value);
        const delta = {}; delta[key] = value;
        postCmi(delta).catch(()=>{});
        return 'true';
      },
      Commit: function(param) { postCmi(cmi); return 'true'; },
      GetLastError: function() { return '0'; },
      GetErrorString: function() { return ''; },
      GetDiagnostic: function() { return ''; }
    };
  }

  window.{$api} = version === '2004' ? api2004() : api12();
})();
</script>
</body>
</html>
HTML;
    }

    protected function extractCompletionStatus(array $cmi, string $courseId): ?string
    {
        $keys = [
            'cmi.core.lesson_status',
            'cmi.completion_status',
            'cmi.success_status',
        ];
        foreach ($keys as $k) {
            $v = strtolower($cmi[$k] ?? '');
            if (in_array($v, ['completed','passed'], true)) return $v;
        }
        return null;
    }

    protected function extractScore(array $cmi): ?int
    {
        $raw = $cmi['cmi.core.score.raw'] ?? $cmi['cmi.score.raw'] ?? null;
        if ($raw !== null && is_numeric($raw)) return (int) $raw;
        $min = $cmi['cmi.core.score.min'] ?? $cmi['cmi.score.min'] ?? '0';
        $max = $cmi['cmi.core.score.max'] ?? $cmi['cmi.score.max'] ?? '100';
        $raw = $cmi['cmi.core.score.raw'] ?? $cmi['cmi.score.raw'] ?? null;
        if ($raw !== null && is_numeric($raw) && $max > $min) {
            return (int) round((($raw - $min) / ($max - $min)) * 100);
        }
        return null;
    }

    protected function checkCourseCompletion(string $enrollmentId, string $courseId): void
    {
        $enrollment = DB::table('enrollments')->where('id', $enrollmentId)->first();
        if (! $enrollment || $enrollment->status === 'completed') return;

        $total = DB::table('lessons as l')
            ->join('course_modules as m', 'm.id', '=', 'l.module_id')
            ->where('m.course_id', $courseId)
            ->count();

        $done = DB::table('lesson_progress')
            ->where('enrollment_id', $enrollmentId)
            ->where('completed', true)
            ->count();

        if ($total > 0 && $done >= $total) {
            $serial = strtoupper(Str::random(16));
            $certId = (string) Str::uuid();
            DB::table('certificates')->insert([
                'id' => $certId,
                'company_id' => DB::table('courses')->where('id', $courseId)->value('company_id'),
                'user_id' => $enrollment->user_id,
                'course_id' => $courseId,
                'serial' => $serial,
                'user_name' => DB::table('profiles')->where('user_id', $enrollment->user_id)->value('full_name'),
                'course_title' => DB::table('courses')->where('id', $courseId)->value('title'),
                'issued_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('enrollments')->where('id', $enrollmentId)->update([
                'status' => 'completed',
                'completed_at' => now(),
                'certificate_id' => $certId,
                'updated_at' => now(),
            ]);
        }
    }
}
