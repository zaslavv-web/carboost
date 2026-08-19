<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
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
}
