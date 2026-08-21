<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
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

    /** Cookie короткоживущей SCORM-сессии (iframe не умеет слать bearer). */
    protected const SESSION_COOKIE = 'scorm_sess';

    protected function uid(): ?string
    {
        $id = Auth::id() ?: Auth::guard('sanctum')->id();
        return $id ? (string) $id : null;
    }

    /** uid из bearer-токена либо из подписанной SCORM-cookie. */
    protected function resolveUid(Request $r): ?string
    {
        return $this->uid() ?: ($this->sessionPayload($r)['uid'] ?? null);
    }

    /** Разбор и проверка подписи cookie SCORM-сессии. */
    protected function sessionPayload(Request $r): ?array
    {
        $raw = (string) $r->cookie(self::SESSION_COOKIE, '');
        if ($raw === '') return null;
        [$body, $sig] = array_pad(explode('.', $raw, 2), 2, '');
        if ($body === '' || $sig === '') return null;
        if (! hash_equals(hash_hmac('sha256', $body, (string) config('app.key')), $sig)) return null;
        $data = json_decode((string) base64_decode(strtr($body, '-_', '+/'), true), true);
        if (! is_array($data) || (int) ($data['exp'] ?? 0) < time()) return null;
        return $data;
    }

    protected function signSession(array $payload): string
    {
        $body = rtrim(strtr(base64_encode((string) json_encode($payload)), '+/', '-_'), '=');
        return $body . '.' . hash_hmac('sha256', $body, (string) config('app.key'));
    }

    protected function canAuthor(): bool
    {
        $u = Auth::user() ?: Auth::guard('sanctum')->user();
        if (! $u) return false;
        $roles = DB::table('user_roles')->where('user_id', $u->id)->pluck('role')->all();
        return (bool) array_intersect($roles, ['hr','hrd','company_admin','superadmin']);
    }

    protected function companyId(): ?string
    {
        $u = Auth::user() ?: Auth::guard('sanctum')->user();
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

        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (str_contains($name, '..') || str_starts_with($name, '/')) {
                $zip->close();
                $disk->deleteDirectory($base);
                return response()->json(['error' => 'invalid zip entry: ' . $name], 400);
            }
            if (! str_ends_with($name, '/')) $entries[] = $name;
        }
        $extracted = $zip->extractTo($extractTo);
        $zip->close();

        if ($extracted !== true) {
            $disk->deleteDirectory($base);
            \Log::warning('scorm_unpack', ['package' => $base, 'result' => 'extract_failed', 'entries' => count($entries)]);
            return response()->json([
                'error' => 'Не удалось распаковать архив на сервере. Проверьте права на запись в хранилище SCORM и свободное место на диске.',
            ], 422);
        }

        // Сверяем содержимое архива с тем, что реально легло на диск.
        $missing = [];
        foreach ($entries as $name) {
            if ($name === 'package.zip') continue;
            if (! is_file($extractTo . '/' . $name)) $missing[] = $name;
        }
        \Log::info('scorm_unpack', [
            'package' => $base,
            'zip_entries' => count($entries),
            'missing' => count($missing),
        ]);
        if ($missing) {
            $disk->deleteDirectory($base);
            return response()->json([
                'error' => 'Пакет распакован не полностью: на диск не попали ' . count($missing) . ' файл(ов). Проверьте права на запись в хранилище SCORM и свободное место.',
                'missing' => array_slice($missing, 0, 20),
            ], 422);
        }

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
            'files' => count($entries),
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
        if (empty($manifest['items'])) {
            return response()->json([
                'error' => 'В imsmanifest.xml не найдено ни одного запускаемого материала (SCO). Проверьте, что архив содержит ресурсы с href.',
            ], 422);
        }

        // href в манифесте задаются относительно каталога самого imsmanifest.xml,
        // который в реальных архивах часто лежит в подпапке. Приводим к пути
        // относительно корня пакета и проверяем существование файла на диске.
        $manifestDir = trim(str_replace('\\', '/', dirname($manifestRel)), '/.');
        foreach ($manifest['items'] as $i => $item) {
            $manifest['items'][$i]['href'] = $this->resolveHrefOnDisk($disk, $base, $manifestDir, (string) $item['href']);
        }

        // Самопроверка: каждый launch_url обязан существовать на диске,
        // иначе создастся «пустой» курс, который потом отдаёт 404 на уроках.
        $missingHrefs = [];
        foreach ($manifest['items'] as $item) {
            $href = (string) ($item['href'] ?? '');
            if ($href === '' || ! $this->findAssetOnDisk($disk, $base, $href)) {
                $missingHrefs[] = $href !== '' ? $href : ($item['title'] ?? 'без ссылки');
            }
        }
        if ($missingHrefs) {
            \Log::warning('scorm_import_missing_files', ['package' => $base, 'missing' => $missingHrefs]);
            return response()->json([
                'error' => 'В распакованном пакете отсутствуют файлы уроков (' . count($missingHrefs) . '). Загрузите архив заново.',
                'missing' => array_slice($missingHrefs, 0, 20),
            ], 422);
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

        return response()->json([
            'course_id' => $courseId,
            'title' => $title,
            'lessons' => count($manifest['items']),
        ]);

    }

    /**
     * Выдать одноразовый тикет запуска (вызывается фронтом с bearer-токеном).
     * Iframe не может передать Authorization, поэтому запуск идёт по тикету.
     */
    public function launchTicket(Request $r, string $courseId, string $lessonId)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $ctx = $this->resolveLaunchContext($uid, $courseId, $lessonId);
        if ($ctx instanceof \Illuminate\Http\JsonResponse) return $ctx;

        $ticket = Str::random(48);
        Cache::put('scorm_ticket:' . $ticket, [
            'user_id'       => $uid,
            'course_id'     => $courseId,
            'lesson_id'     => $lessonId,
            'enrollment_id' => $ctx['enrollment_id'],
            'package_path'  => $ctx['package_path'],
        ], now()->addSeconds(60));

        return response()->json([
            'ticket'     => $ticket,
            'launch_url' => '/api/university/scorm/launch/' . $ticket,
        ]);
    }

    /**
     * Публичный запуск по одноразовому тикету: ставит короткоживущую cookie
     * SCORM-сессии и отдаёт HTML-лаунчер.
     */
    public function launchByTicket(Request $r, string $ticket)
    {
        $key = 'scorm_ticket:' . $ticket;
        $payload = Cache::get($key);
        if (! is_array($payload)) {
            return new Response('Ссылка устарела, откройте урок заново.', 410, ['Content-Type' => 'text/plain; charset=utf-8']);
        }
        Cache::forget($key);

        $course = DB::table('courses')->where('id', $payload['course_id'])->first();
        $lesson = DB::table('lessons')->where('id', $payload['lesson_id'])->first();
        if (! $course || ! $lesson) {
            return new Response('Материал не найден.', 404, ['Content-Type' => 'text/plain; charset=utf-8']);
        }

        $version = $course->scorm_version === '2004' ? '2004' : '1.2';
        $base = $this->healPackagePath($course, (string) $lesson->launch_url);
        if (! $this->findAssetOnDisk(Storage::disk('scorm-packages'), $base, (string) $lesson->launch_url)) {
            return new Response($this->missingPackageHtml(), 410, ['Content-Type' => 'text/html; charset=utf-8']);
        }
        $launchUrl = $this->courseAssetUrl((string) $course->id, (string) $lesson->launch_url);
        $html = $this->launchHtml($launchUrl, $payload['enrollment_id'], (string) $payload['lesson_id'], $version);

        $cookie = cookie(
            self::SESSION_COOKIE,
            $this->signSession([
                'uid'           => $payload['user_id'],
                'package_path'  => $base,
                'course_id'     => (string) $course->id,
                'enrollment_id' => $payload['enrollment_id'],
                'exp'           => time() + 4 * 3600,
            ]),
            240,                       // минут
            '/api/university/scorm',   // path
            null,                      // domain
            $r->isSecure(),            // secure
            true,                      // httpOnly
            false,
            'Lax'
        );

        return (new Response($html, 200, ['Content-Type' => 'text/html; charset=utf-8']))->withCookie($cookie);
    }

    /**
     * Serve a launch page for a SCORM lesson (bearer-режим, обратная совместимость).
     */
    public function launch(Request $r, string $courseId, string $lessonId)
    {
        $uid = $this->uid();
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $ctx = $this->resolveLaunchContext($uid, $courseId, $lessonId);
        if ($ctx instanceof \Illuminate\Http\JsonResponse) return $ctx;

        $html = $this->launchHtml($ctx['launch_url'], $ctx['enrollment_id'], $lessonId, $ctx['version']);
        return new Response($html, 200, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    /**
     * Диагностика: реальное содержимое распакованного пакета и launch_url уроков.
     * Только для авторов/HR — помогает понять, почему ассет отдаёт 404.
     */
    public function packageFiles(Request $r, string $courseId)
    {
        if (! $this->canAuthor()) return response()->json(['error' => 'forbidden'], 403);

        $course = DB::table('courses')->where('id', $courseId)->first();
        if (! $course) return response()->json(['error' => 'not found'], 404);

        $base = (string) $course->scorm_package_path;
        $disk = Storage::disk('scorm-packages');
        $files = [];
        try {
            foreach ($disk->allFiles($base) as $f) {
                $files[] = ltrim(substr($f, strlen($base)), '/');
            }
        } catch (\Throwable $e) {
            $files = ['__error__' => $e->getMessage()];
        }

        $lessons = DB::table('lessons')
            ->whereIn('module_id', function ($q) use ($courseId) {
                $q->select('id')->from('course_modules')->where('course_id', $courseId);
            })
            ->get(['id', 'title', 'launch_url'])
            ->map(function ($l) use ($disk, $base) {
                $resolved = $l->launch_url ? $this->findAssetOnDisk($disk, $base, (string) $l->launch_url) : null;
                return [
                    'id' => $l->id,
                    'title' => $l->title,
                    'launch_url' => $l->launch_url,
                    'resolved_path' => $resolved,
                    'exists' => (bool) $resolved,
                ];
            });

        return response()->json([
            'package_path' => $base,
            'exists'       => is_dir($disk->path($base)),
            'writable'     => is_writable($disk->path($base)),
            'file_count'   => count($files),
            'files'        => array_slice($files, 0, 300),
            'lessons'      => $lessons,
            'missing_lessons' => $lessons->where('exists', false)->count(),
        ]);

    }



    /**
     * Общие проверки доступа к SCORM-уроку.
     *
     * @return array{enrollment_id: ?string, package_path: string, launch_url: string, version: string}|\Illuminate\Http\JsonResponse
     */
    protected function resolveLaunchContext(string $uid, string $courseId, string $lessonId)
    {
        $course = DB::table('courses')->where('id', $courseId)->first();
        if (! $course || $course->source_type !== 'scorm') {
            return response()->json(['error' => 'not found'], 404);
        }

        // ВАЖНО: у курса несколько модулей, поэтому whereIn (скалярный подзапрос
        // падал с "Subquery returns more than 1 row" → 500).
        $lesson = DB::table('lessons')->where('id', $lessonId)->whereIn('module_id', function ($q) use ($courseId) {
            $q->select('id')->from('course_modules')->where('course_id', $courseId);
        })->first();
        if (! $lesson) return response()->json(['error' => 'lesson not found'], 404);

        $enrollment = DB::table('enrollments')
            ->where('course_id', $courseId)
            ->where('user_id', $uid)
            ->first();

        if (! $enrollment && ! $this->canAuthor()) {
            return response()->json(['error' => 'not enrolled'], 403);
        }

        $base = $this->healPackagePath($course, (string) $lesson->launch_url);
        if (! $this->findAssetOnDisk(Storage::disk('scorm-packages'), $base, (string) $lesson->launch_url)) {
            return response()->json([
                'error' => 'Файлы курса отсутствуют в хранилище. Загрузите SCORM ZIP повторно.',
                'code' => 'scorm_package_missing',
            ], 410);
        }

        return [
            'enrollment_id' => $enrollment?->id,
            'package_path'  => $base,
            'launch_url'    => $this->courseAssetUrl($courseId, (string) $lesson->launch_url),
            'version'       => $course->scorm_version === '2004' ? '2004' : '1.2',
        ];
    }

    /**
     * Если каталог пакета курса потерян (перезалив/сбой распаковки), ищем
     * рядом (в папке компании) другой распакованный пакет, где лежит нужный
     * файл урока, и чиним ссылку курса.
     */
    protected function healPackagePath($course, string $launchUrl): string
    {
        $base = (string) ($course->scorm_package_path ?? '');
        $disk = Storage::disk('scorm-packages');

        if ($base !== '' && $launchUrl !== '' && $this->findAssetOnDisk($disk, $base, $launchUrl)) {
            return $base;
        }

        $companyDir = (string) ($course->company_id ?? (str_contains($base, '/') ? explode('/', $base)[0] : ''));
        $candidate = $this->findPackageContaining($companyDir, $launchUrl, $base);
        if ($candidate) {
            try {
                DB::table('courses')->where('id', $course->id)->update(['scorm_package_path' => $candidate]);
            } catch (\Throwable $e) {
                // не критично: отдадим рабочий путь даже без записи в БД
            }
            \Log::warning('scorm_package_healed', ['course' => $course->id, 'from' => $base, 'to' => $candidate]);
            return $candidate;
        }

        return $base;
    }

    /** Ищем в папке компании пакет, содержащий указанный относительный файл. */
    protected function findPackageContaining(string $companyDir, string $relative, string $skip = ''): ?string
    {
        if ($companyDir === '' || $relative === '') return null;
        $disk = Storage::disk('scorm-packages');
        try {
            $dirs = $disk->directories($companyDir);
        } catch (\Throwable $e) {
            return null;
        }
        foreach ($dirs as $dir) {
            if ($dir === $skip) continue;
            if ($this->findAssetOnDisk($disk, $dir, $relative)) return $dir;
        }
        return null;
    }



    /**
     * Store cmi data coming from the SCORM content.
     */
    public function storeCmi(Request $r, string $enrollmentId)
    {
        $uid = $this->resolveUid($r);
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
        $uid = $this->resolveUid($r);
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

    /**
     * Приводим href из манифеста к пути относительно корня пакета:
     * сначала каталог манифеста, затем корень, затем поиск по имени файла.
     */
    protected function resolveHrefOnDisk($disk, string $base, string $manifestDir, string $href): string
    {
        $href = ltrim(str_replace('\\', '/', trim($href)), '/');
        if ($href === '' || preg_match('#^https?://#i', $href)) return $href;

        // Query/anchor сохраняем, но при проверке файла отбрасываем.
        [$file, $suffix] = array_pad(preg_split('/([?#])/', $href, 2, PREG_SPLIT_DELIM_CAPTURE) ?: [$href], 2, '');
        $tail = substr($href, strlen($file));

        $candidates = [];
        if ($manifestDir !== '') $candidates[] = $manifestDir . '/' . $file;
        $candidates[] = $file;

        foreach ($candidates as $cand) {
            $cand = $this->normalizeRelative($cand);
            if ($cand !== '' && is_file($disk->path($base . '/' . $cand))) {
                return $cand . $tail;
            }
        }

        // Последний шанс: ищем файл с таким именем внутри пакета.
        $needle = basename($file);
        foreach ($disk->allFiles($base) as $f) {
            if (basename($f) === $needle) {
                return ltrim(substr($f, strlen($base)), '/') . $tail;
            }
        }

        return $this->normalizeRelative($manifestDir !== '' ? $manifestDir . '/' . $file : $file) . $tail;
    }

    /** Убираем ./ и ../ из относительного пути. */
    protected function normalizeRelative(string $path): string
    {
        $out = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $seg) {
            if ($seg === '' || $seg === '.') continue;
            if ($seg === '..') { array_pop($out); continue; }
            $out[] = $seg;
        }
        return implode('/', $out);
    }



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

        // Реальные imsmanifest.xml объявляют default- и префиксные namespace
        // (imscp, adlcp, xsi). SimpleXML теряет вложенные узлы при обходе через
        // children($ns), поэтому убираем namespace-объявления и префиксы —
        // структура манифеста от этого не меняется.
        $clean = preg_replace('/\sxmlns(:[A-Za-z0-9_.-]+)?\s*=\s*"[^"]*"/', '', $xml);
        $clean = preg_replace('/<(\/?)[A-Za-z0-9_.-]+:/', '<$1', (string) $clean);
        $clean = preg_replace('/\s[A-Za-z0-9_.-]+:([A-Za-z0-9_.-]+\s*=\s*")/', ' $1', (string) $clean);

        $doc = simplexml_load_string((string) $clean) ?: simplexml_load_string($xml);
        if (! $doc) return null;

        $ns = [];
        $version = '1.2';
        $schema = strtolower(trim((string) ($doc->metadata->schemaversion ?? $doc->schemaversion ?? '')));
        if (str_contains($schema, '2004')) $version = '2004';

        // Title from metadata or first organization
        $title = '';
        $manifestNs = $doc;

        $organizations = $manifestNs->organizations ?? $doc->organizations;
        $organization = null;
        if ($organizations) {
            $default = (string) ($organizations['default'] ?? '');
            foreach ($organizations->organization as $org) {
                if (! $organization) $organization = $org;
                if ($default && (string) ($org['identifier'] ?? '') === $default) {
                    $organization = $org;
                    break;
                }
            }
        }

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

        // Фолбэк: организация без валидных item/identifierref (или манифест
        // с одним ресурсом). Берём запускаемые ресурсы напрямую, иначе курс
        // создастся пустым.
        if (! $items) {
            $resources = $manifestNs->resources ?? null;
            if ($resources) {
                foreach ($resources->resource as $res) {
                    $scormType = strtolower((string) ($res['scormtype'] ?? $res['scormType'] ?? ''));
                    if ($scormType && $scormType !== 'sco') continue;
                    $href = $this->resourceHref($res, $manifestNs);
                    if (! $href) continue;
                    $items[] = ['title' => $title ?: 'Урок ' . (count($items) + 1), 'href' => $href];
                }
            }
        }
        if (! $items) {
            $resources = $manifestNs->resources ?? null;
            if ($resources) {
                foreach ($resources->resource as $res) {
                    $href = $this->resourceHref($res, $manifestNs);
                    if ($href) {
                        $items[] = ['title' => $title ?: 'Урок', 'href' => $href];
                        break;
                    }
                }
            }
        }

        return ['version' => $version, 'title' => $title, 'items' => $items];
    }

    /** Ищем ресурс по identifier. */
    protected function findResource($manifestNs, string $identifier)
    {
        $resources = $manifestNs->resources ?? null;
        if (! $resources || ! $identifier) return null;
        foreach ($resources->resource as $res) {
            if ((string) ($res['identifier'] ?? '') === $identifier) return $res;
        }
        return null;
    }

    /**
     * Href ресурса: сначала атрибут href, затем первый html-файл ресурса,
     * затем href зависимостей (<dependency identifierref="...">).
     */
    protected function resourceHref($res, $manifestNs, int $depth = 0): string
    {
        if (! $res || $depth > 3) return '';

        // xml:base на уровне <resources> и <resource> (префиксы уже срезаны).
        $base = trim((string) (($manifestNs->resources['base'] ?? '')));
        $base .= trim((string) ($res['base'] ?? ''));
        $base = $base ? rtrim($base, '/') . '/' : '';

        $href = trim((string) ($res['href'] ?? ''));
        if ($href) return $base . ltrim($href, '/');



        foreach ($res->file as $f) {
            $fh = trim((string) ($f['href'] ?? ''));
            if ($fh && preg_match('/\.x?html?$/i', $fh)) return $base . ltrim($fh, '/');
        }


        foreach ($res->dependency as $dep) {
            $target = $this->findResource($manifestNs, (string) ($dep['identifierref'] ?? ''));
            $depHref = $this->resourceHref($target, $manifestNs, $depth + 1);
            if ($depHref) return $depHref;
        }

        return '';
    }

    protected function walkItems($item, array &$out, $manifestNs, array $ns, string $prefix = '')
    {
        $identifierref = (string) ($item['identifierref'] ?? '');
        $title = trim((string) ($item->title ?? ''));
        $href = '';

        if ($identifierref) {
            $href = $this->resourceHref($this->findResource($manifestNs, $identifierref), $manifestNs);
        }

        if ($href) {
            $out[] = ['title' => ($prefix ? $prefix . ' / ' : '') . ($title ?: 'Урок'), 'href' => $href];
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

    protected function courseAssetUrl(string $courseId, string $relative): string
    {
        return url('/api/university/scorm/course/' . $courseId . '/asset/' . ltrim($relative, '/'));
    }

    public function courseAsset(Request $r, string $courseId, string $path)
    {
        $session = $this->sessionPayload($r);
        $uid = $this->resolveUid($r);
        if (! $uid) return response()->json(['error' => 'auth required'], 401);
        if ($path === '' || str_contains($path, '..')) return response()->json(['error' => 'invalid path'], 400);

        $course = DB::table('courses')->where('id', $courseId)->first();
        if (! $course || $course->source_type !== 'scorm') return response()->json(['error' => 'not found'], 404);
        $allowed = $session && ($session['course_id'] ?? null) === $courseId && ($session['uid'] ?? null) === $uid;
        if (! $allowed) {
            $allowed = DB::table('enrollments')->where('course_id', $courseId)->where('user_id', $uid)->exists()
                || ($this->canAuthor() && (string) $course->company_id === (string) $this->companyId());
        }
        if (! $allowed) return response()->json(['error' => 'forbidden'], 403);

        $base = $this->healPackagePath($course, $path);
        return $this->serveAsset($base, $path, $courseId);
    }

    /**
     * Serve a single SCORM asset (html, js, images) with enrollment/auth guard.
     */
    public function asset(Request $r)
    {
        $session = $this->sessionPayload($r);
        $uid = $this->resolveUid($r);
        if (! $uid) return response()->json(['error' => 'auth required'], 401);

        $path = (string) $r->route('path', '');
        if (! $path || str_contains($path, '..')) return response()->json(['error' => 'invalid path'], 400);

        // Извлекаем package_path как первые два сегмента (company_id/uuid).
        $segments = explode('/', $path);
        $packagePath = implode('/', array_slice($segments, 0, 2));
        if (! $packagePath || count($segments) < 2) {
            return response()->json(['error' => 'invalid path'], 400);
        }

        // Быстрый путь: cookie SCORM-сессии выдана именно на этот пакет.
        $allowed = $session && ($session['package_path'] ?? null) === $packagePath;

        if (! $allowed) {
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
        }

        if (! $allowed) return response()->json(['error' => 'forbidden'], 403);


        $relative = ltrim(implode('/', array_slice($segments, 2)), '/');
        return $this->serveAsset($packagePath, $relative);
    }

    protected function serveAsset(string $packagePath, string $relative, ?string $courseId = null)
    {
        $disk = Storage::disk('scorm-packages');
        $found = $this->findAssetOnDisk($disk, $packagePath, $relative);

        // Каталог пакета потерян (перезалив/сбой распаковки) — ищем тот же файл
        // в другом пакете этой же компании.
        if (! $found) {
            $companyDir = str_contains($packagePath, '/') ? explode('/', $packagePath)[0] : '';
            $sibling = $this->findPackageContaining($companyDir, $relative, $packagePath);
            if ($sibling) {
                $found = $this->findAssetOnDisk($disk, $sibling, $relative);
                if ($found) {
                    \Log::warning('scorm_asset_sibling', ['from' => $packagePath, 'to' => $sibling, 'relative' => $relative]);
                    $packagePath = $sibling;
                }
            }
        }

        if (! $found) {

            \Log::warning('scorm_asset_404', ['package' => $packagePath, 'relative' => $relative]);
            $body = [
                'error' => 'not found',
                'package_path' => $packagePath,
                'relative' => $relative,
            ];
            if ($this->canAuthor()) {
                try {
                    $all = $disk->allFiles($packagePath);
                } catch (\Throwable $e) {
                    $all = [];
                }
                $rels = array_map(fn ($f) => ltrim(substr($f, strlen($packagePath)), '/'), $all);
                $body['debug'] = [
                    'dir_exists'  => is_dir($disk->path($packagePath)),
                    'file_count'  => count($rels),
                    'sample'      => array_slice($rels, 0, 20),
                ];
            }
            return response()->json($body, 404);

        }

        $full = $disk->path($packagePath . '/' . $found);
        $mime = $this->guessMime($full);
        return response()->file($full, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    protected function missingPackageHtml(): string
    {
        return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Материал недоступен</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#1b1d22;color:#f3f4f6;font:16px Inter,sans-serif"><main style="max-width:560px;padding:32px;text-align:center"><h1 style="font-size:22px">Файлы курса недоступны</h1><p style="color:#b8bdc7;line-height:1.5">Пакет отсутствует в хранилище. Автору курса нужно загрузить SCORM ZIP повторно.</p></main></body></html>';
    }

    /**
     * Ищем файл внутри распакованного пакета максимально терпимо:
     * точное совпадение → декодированный URL → без query → регистронезависимо →
     * совпадение по хвосту пути → совпадение по имени файла.
     */
    protected function findAssetOnDisk($disk, string $base, string $relative): ?string
    {
        $relative = ltrim(str_replace('\\', '/', $relative), '/');
        if ($relative === '') return null;

        $variants = [];
        foreach ([$relative, rawurldecode($relative), urldecode($relative)] as $v) {
            $v = preg_replace('/[?#].*$/', '', $v);
            $v = $this->normalizeRelative((string) $v);
            if ($v !== '' && ! in_array($v, $variants, true)) $variants[] = $v;
        }

        foreach ($variants as $v) {
            $p = $disk->path($base . '/' . $v);
            if (is_file($p)) return $v;
        }

        // Полный обход пакета (кешируем на запрос).
        try {
            $all = $disk->allFiles($base);
        } catch (\Throwable $e) {
            return null;
        }
        $rels = [];
        foreach ($all as $f) {
            $rels[] = ltrim(substr($f, strlen($base)), '/');
        }

        foreach ($variants as $v) {
            $lower = mb_strtolower($v);
            foreach ($rels as $rel) {
                if (mb_strtolower($rel) === $lower) return $rel;
            }
            // Пакет распакован в подпапку: /content/pages/01-intro.html vs pages/01-intro.html
            foreach ($rels as $rel) {
                $rl = mb_strtolower($rel);
                if ($rl === $lower || str_ends_with($rl, '/' . $lower)) return $rel;
            }
        }

        // Последний шанс — по имени файла (если оно уникально).
        foreach ($variants as $v) {
            $needle = mb_strtolower(basename($v));
            $matches = array_values(array_filter($rels, fn ($r) => mb_strtolower(basename($r)) === $needle));
            if (count($matches) === 1) return $matches[0];
        }

        return null;
    }

    protected function guessMime(string $full): string
    {
        $ext = mb_strtolower(pathinfo($full, PATHINFO_EXTENSION));
        $map = [
            'html' => 'text/html', 'htm' => 'text/html', 'xml' => 'application/xml',
            'js' => 'application/javascript', 'mjs' => 'application/javascript',
            'css' => 'text/css', 'json' => 'application/json', 'svg' => 'image/svg+xml',
            'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
            'gif' => 'image/gif', 'webp' => 'image/webp', 'ico' => 'image/x-icon',
            'mp4' => 'video/mp4', 'mp3' => 'audio/mpeg', 'wav' => 'audio/wav',
            'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf',
            'pdf' => 'application/pdf', 'txt' => 'text/plain',
        ];
        if (isset($map[$ext])) return $map[$ext];
        return (function_exists('mime_content_type') ? (mime_content_type($full) ?: '') : '') ?: 'application/octet-stream';
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
<div id="wrap"><iframe id="sco" src="{$launchUrl}" allow="autoplay; fullscreen"></iframe></div>
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
