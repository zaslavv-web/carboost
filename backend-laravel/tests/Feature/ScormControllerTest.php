<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/** ScormController: валидация zip, загрузка манифеста, запуск/трекинг. */
class ScormControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('scorm-packages');
    }

    public function test_non_zip_upload_is_rejected_with_422(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $file = UploadedFile::fake()->create('package.txt', 10, 'text/plain');

        $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertStatus(422);
    }

    public function test_employee_cannot_upload_scorm_package(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $file = UploadedFile::fake()->create('package.zip', 10, 'application/zip');

        $this->actingAs($employee, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertStatus(403);
    }

    public function test_upload_and_import_valid_manifest_creates_course_with_scorm_lesson(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $manifest = <<<XML
<?xml version="1.0"?>
<manifest identifier="MANIFEST-1" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Тестовый SCORM-курс</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>Урок 1</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
XML;

        $zipPath = tempnam(sys_get_temp_dir(), 'scorm') . '.zip';
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE);
        $zip->addFromString('imsmanifest.xml', $manifest);
        $zip->addFromString('index.html', '<html>SCO</html>');
        $zip->close();

        $file = new UploadedFile($zipPath, 'package.zip', 'application/zip', null, true);

        $upload = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertOk();

        $uploadToken = $upload->json('upload_token');
        $this->assertNotEmpty($uploadToken);

        $import = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/import', ['upload_token' => $uploadToken])
            ->assertOk();

        $courseId = $import->json('course_id');
        $this->assertDatabaseHas('courses', ['id' => $courseId, 'company_id' => $company->id, 'source_type' => 'scorm']);
        $this->assertSame(1, DB::table('lessons')->where('type', 'scorm')->count());

        @unlink($zipPath);
    }

    public function test_launch_requires_enrollment_for_non_authors(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'SCORM',
            'slug' => 'scorm-course', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'scorm_package_path' => $company->id . '/pkg', 'status' => 'published',
            'level' => 'beginner', 'duration_min' => 0, 'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'launch_url' => 'index.html',
            'pass_score' => 70, 'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->getJson("/api/university/scorm/{$courseId}/launch/{$lessonId}")
            ->assertStatus(403);
    }

    public function test_import_falls_back_to_resources_when_items_have_no_ref(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $manifest = <<<XML
<?xml version="1.0"?>
<manifest identifier="M2" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Курс без ссылок</title>
      <item identifier="ITEM-1"><title>Раздел</title></item>
    </organization>
  </organizations>
  <resources xml:base="content/">
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco">
      <file href="start.html"/>
    </resource>
  </resources>
</manifest>
XML;

        $zipPath = tempnam(sys_get_temp_dir(), 'scorm') . '.zip';
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE);
        $zip->addFromString('imsmanifest.xml', $manifest);
        $zip->addFromString('content/start.html', '<html>SCO</html>');
        $zip->close();

        $file = new UploadedFile($zipPath, 'package.zip', 'application/zip', null, true);

        $token = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertOk()->json('upload_token');

        $import = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/import', ['upload_token' => $token])
            ->assertOk();

        $this->assertSame(1, $import->json('lessons'));
        $this->assertDatabaseHas('lessons', ['launch_url' => 'content/start.html', 'type' => 'scorm']);

        @unlink($zipPath);
    }

    public function test_launch_ticket_flow_serves_html_and_asset_via_cookie(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();
        $enrollmentId = (string) Str::uuid();
        $pkg = $company->id . '/pkg';

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'SCORM',
            'slug' => 'scorm-ticket', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'scorm_package_path' => $pkg, 'status' => 'published',
            'level' => 'beginner', 'duration_min' => 0, 'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'launch_url' => 'index.html',
            'pass_score' => 70, 'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('enrollments')->insert([
            'id' => $enrollmentId, 'course_id' => $courseId, 'user_id' => $employee->id,
            'status' => 'in_progress',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        Storage::disk('scorm-packages')->put($pkg . '/index.html', '<html>SCO</html>');

        $ticket = $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/scorm/{$courseId}/launch-ticket/{$lessonId}")
            ->assertOk()
            ->json('ticket');
        $this->assertNotEmpty($ticket);

        $launch = $this->get("/api/university/scorm/launch/{$ticket}");
        $launch->assertOk();
        $launch->assertSee('SCORM', false);
        $cookie = $launch->headers->getCookies()[0] ?? null;
        $this->assertNotNull($cookie);
        $this->assertSame('scorm_sess', $cookie->getName());

        // Повторный GET в течение TTL работает: prefetch/iframe reload не ломают урок.
        $this->get("/api/university/scorm/launch/{$ticket}")->assertOk();

        // С cookie — доступен.
        $this->withUnencryptedCookie('scorm_sess', $cookie->getValue())
            ->get("/api/university/scorm/asset/{$pkg}/index.html")
            ->assertOk();

        $this->withUnencryptedCookie('scorm_sess', $cookie->getValue())
            ->get("/api/university/scorm/course/{$courseId}/asset/index.html")
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        // Чужой пакет с той же cookie — запрещён.
        $this->withUnencryptedCookie('scorm_sess', $cookie->getValue())
            ->get("/api/university/scorm/asset/other-company/pkg/index.html")
            ->assertStatus(403);
    }

    public function test_expired_launch_ticket_is_rejected(): void
    {
        $encrypted = Crypt::encryptString((string) json_encode([
            'user_id' => (string) Str::uuid(),
            'course_id' => (string) Str::uuid(),
            'lesson_id' => (string) Str::uuid(),
            'enrollment_id' => (string) Str::uuid(),
            'package_path' => 'expired/package',
            'exp' => time() - 1,
            'nonce' => Str::random(16),
        ]));
        $ticket = rtrim(strtr(base64_encode($encrypted), '+/', '-_'), '=');

        $this->get("/api/university/scorm/launch/{$ticket}")
            ->assertStatus(410)
            ->assertSee('Ссылка устарела');
    }

    public function test_asset_without_any_credentials_is_unauthorized(): void
    {
        $this->get('/api/university/scorm/asset/some-company/pkg/index.html')
            ->assertStatus(401);
    }

    public function test_empty_cmi_commit_is_accepted_as_no_op(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();
        $enrollmentId = (string) Str::uuid();

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'SCORM CMI',
            'slug' => 'scorm-cmi', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'status' => 'published', 'level' => 'beginner', 'duration_min' => 0,
            'mandatory' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'pass_score' => 70,
            'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('enrollments')->insert([
            'id' => $enrollmentId, 'course_id' => $courseId, 'user_id' => $employee->id,
            'status' => 'in_progress', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/scorm/{$enrollmentId}/cmi", [
                'lesson_id' => $lessonId,
                'cmi' => [],
            ])
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_launch_ticket_forbidden_for_non_enrolled_employee(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'SCORM',
            'slug' => 'scorm-no-enroll', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'scorm_package_path' => $company->id . '/pkg2', 'status' => 'published',
            'level' => 'beginner', 'duration_min' => 0, 'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'launch_url' => 'index.html',
            'pass_score' => 70, 'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/scorm/{$courseId}/launch-ticket/{$lessonId}")
            ->assertStatus(403);
    }

    public function test_launch_ticket_reports_missing_package_before_iframe_is_created(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'Missing SCORM',
            'slug' => 'missing-scorm', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'scorm_package_path' => $company->id . '/missing', 'status' => 'published',
            'level' => 'beginner', 'duration_min' => 0, 'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'launch_url' => 'index.html',
            'pass_score' => 70, 'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('enrollments')->insert([
            'id' => (string) Str::uuid(), 'course_id' => $courseId, 'user_id' => $employee->id,
            'status' => 'not_started', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/scorm/{$courseId}/launch-ticket/{$lessonId}")
            ->assertStatus(410)
            ->assertJsonPath('code', 'scorm_package_missing');
    }

    public function test_launch_ticket_restores_unpacked_files_from_preserved_zip(): void
    {
        $company = $this->makeCompany();
        $employee = $this->makeUser('employee', $company->id);
        $courseId = (string) Str::uuid();
        $moduleId = (string) Str::uuid();
        $lessonId = (string) Str::uuid();
        $package = $company->id . '/recoverable';

        DB::table('courses')->insert([
            'id' => $courseId, 'company_id' => $company->id, 'title' => 'Recoverable SCORM',
            'slug' => 'recoverable-scorm', 'source_type' => 'scorm', 'scorm_version' => '1.2',
            'scorm_package_path' => $package, 'status' => 'published',
            'level' => 'beginner', 'duration_min' => 0, 'mandatory' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('course_modules')->insert([
            'id' => $moduleId, 'course_id' => $courseId, 'order_index' => 0,
            'title' => 'M1', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('lessons')->insert([
            'id' => $lessonId, 'module_id' => $moduleId, 'order_index' => 0,
            'type' => 'scorm', 'title' => 'L1', 'launch_url' => 'pages/01-intro.html',
            'pass_score' => 70, 'duration_min' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('enrollments')->insert([
            'id' => (string) Str::uuid(), 'course_id' => $courseId, 'user_id' => $employee->id,
            'status' => 'not_started', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $zipPath = tempnam(sys_get_temp_dir(), 'scorm-recovery');
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        $zip->addFromString('pages/01-intro.html', '<html>Recovered SCO</html>');
        $zip->close();
        Storage::disk('scorm-packages')->put($package . '/package.zip', file_get_contents($zipPath));

        $this->actingAs($employee, 'sanctum')
            ->postJson("/api/university/scorm/{$courseId}/launch-ticket/{$lessonId}")
            ->assertOk();
        Storage::disk('scorm-packages')->assertExists($package . '/pages/01-intro.html');
        @unlink($zipPath);
    }

    public function test_import_rejects_package_when_lesson_file_missing_on_disk(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $manifest = <<<XML
<?xml version="1.0"?>
<manifest identifier="M3" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Битый курс</title>
      <item identifier="ITEM-1" identifierref="RES-1"><title>Урок 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" href="pages/01-intro.html"/>
  </resources>
</manifest>
XML;

        $zipPath = tempnam(sys_get_temp_dir(), 'scorm') . '.zip';
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE);
        $zip->addFromString('imsmanifest.xml', $manifest);
        $zip->close();

        $file = new UploadedFile($zipPath, 'package.zip', 'application/zip', null, true);

        $token = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertOk()->json('upload_token');

        $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/import', ['upload_token' => $token])
            ->assertStatus(422);

        $this->assertSame(0, DB::table('courses')->where('source_type', 'scorm')->count());

        @unlink($zipPath);
    }

    public function test_multipage_package_imports_and_serves_every_asset(): void
    {
        $company = $this->makeCompany();
        $hr = $this->makeUser('hr', $company->id);

        $pages = ['01-intro', '02-start', 'quiz'];
        $items = '';
        $resources = '';
        foreach ($pages as $p) {
            $items .= "<item identifier=\"I-$p\" identifierref=\"R-$p\"><title>$p</title></item>";
            $resources .= "<resource identifier=\"R-$p\" type=\"webcontent\" href=\"pages/$p.html\"><file href=\"pages/$p.html\"/><dependency identifierref=\"R-common\"/></resource>";
        }
        $resources .= '<resource identifier="R-common" type="webcontent"><file href="assets/style.css"/><file href="assets/scorm.js"/></resource>';

        $manifest = <<<XML
<?xml version="1.0"?>
<manifest identifier="M4" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1"><title>Мультистраничный курс</title>$items</organization>
  </organizations>
  <resources>$resources</resources>
</manifest>
XML;

        $zipPath = tempnam(sys_get_temp_dir(), 'scorm') . '.zip';
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE);
        $zip->addFromString('imsmanifest.xml', $manifest);
        foreach ($pages as $p) {
            $zip->addFromString("pages/$p.html", "<html>$p</html>");
        }
        $zip->addFromString('assets/style.css', 'body{}');
        $zip->addFromString('assets/scorm.js', '// api');
        $zip->close();

        $file = new UploadedFile($zipPath, 'package.zip', 'application/zip', null, true);

        $token = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/upload', ['file' => $file])
            ->assertOk()->json('upload_token');

        $import = $this->actingAs($hr, 'sanctum')
            ->postJson('/api/university/scorm/import', ['upload_token' => $token])
            ->assertOk();

        $this->assertSame(count($pages), $import->json('lessons'));

        $courseId = $import->json('course_id');
        $files = $this->actingAs($hr, 'sanctum')
            ->getJson("/api/university/scorm/{$courseId}/files")
            ->assertOk();
        $this->assertSame(0, $files->json('missing_lessons'));

        $base = $company->id . '/' . $token;
        foreach (['pages/01-intro.html', 'assets/style.css', 'assets/scorm.js'] as $rel) {
            $this->actingAs($hr, 'sanctum')
                ->get("/api/university/scorm/asset/{$base}/{$rel}")
                ->assertOk();
        }

        @unlink($zipPath);
    }
}

