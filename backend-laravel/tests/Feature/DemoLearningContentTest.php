<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/**
 * Наполнение демо-стенда обучением, ИПР и уровнями.
 *
 * Смысл проверки не в количестве строк, а в том, что сотрудник увидит контент:
 * каталог показывает только опубликованные курсы, у целевой учётки есть записи
 * с прогрессом, а повторный прогон сидера не размножает данные — иначе демо
 * после второго запуска выглядит как склад дублей.
 */
class DemoLearningContentTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    /**
     * Предпосылки, которые создаёт не эта команда, а `demo:seed`:
     * без задач трекера и хотя бы одного сообщества сидер считает стенд
     * ненаполненным и падает собственной проверкой.
     */
    private function prepareStand(string $companyId, string $ownerEmail): void
    {
        DB::table('portal_communities')->insert([
            'id' => (string) Str::uuid(), 'company_id' => $companyId,
            'title' => 'Клуб бегунов', 'slug' => 'runners', 'privacy' => 'open',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->artisan('tracker:seed-tasks', [
            '--company-id' => $companyId, '--count' => 40,
            '--projects' => 2, '--sprints' => 1, '--per-user' => 1,
        ])->assertExitCode(0);
    }

    private function seedDemo(string $companyId, string $email): void
    {
        $this->artisan('demo:seed-extras', ['--company' => $companyId, '--email' => $email])
            ->assertExitCode(0);
    }

    public function test_university_idp_and_levels_are_filled(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $hrd = $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);
        $email = DB::table('users')->where('id', $employee->id)->value('email');

        $this->prepareStand($company->id, $email);
        $this->seedDemo($company->id, $email);

        // Каталог: сотрудник видит только опубликованные курсы.
        $courses = DB::table('courses')->where('company_id', $company->id)->get();
        $this->assertGreaterThanOrEqual(5, $courses->count());
        $this->assertSame([], $courses->where('status', '!=', 'published')->pluck('title')->all());
        $this->assertTrue($courses->contains('mandatory', true), 'нет ни одного обязательного курса');

        // Курс без уроков в интерфейсе выглядит как пустая карточка.
        foreach ($courses as $course) {
            $lessons = DB::table('lessons as l')
                ->join('course_modules as m', 'm.id', '=', 'l.module_id')
                ->where('m.course_id', $course->id)->count();
            $this->assertGreaterThan(0, $lessons, "у курса «{$course->title}» нет уроков");
        }

        // У целевого сотрудника — все три состояния и сертификат за пройденный курс.
        $mine = DB::table('enrollments')->where('user_id', $employee->id)->get();
        $this->assertEqualsCanonicalizing(
            ['completed', 'in_progress', 'not_started'],
            $mine->pluck('status')->all(),
        );
        $completed = $mine->firstWhere('status', 'completed');
        $this->assertNotNull($completed->certificate_id, 'за пройденный курс не выдан сертификат');
        $this->assertGreaterThan(
            0,
            DB::table('lesson_progress')->where('enrollment_id', $completed->id)->where('completed', true)->count(),
            'у пройденного курса нет отмеченных уроков',
        );

        // ИПР и уровни.
        $plan = DB::table('individual_development_plans')->where('user_id', $employee->id)->first();
        $this->assertNotNull($plan, 'у сотрудника нет плана развития');
        $this->assertGreaterThanOrEqual(5, DB::table('idp_items')->where('idp_id', $plan->id)->count());
        $this->assertNotNull(
            DB::table('idp_items')->where('idp_id', $plan->id)->whereNotNull('course_id')->first(),
            'ни один пункт ИПР не связан с курсом',
        );
        $this->assertSame(5, DB::table('gamification_levels')->where('company_id', $company->id)->count());

        // Обучение назначено не одному человеку — иначе аналитика HRD пуста.
        $this->assertGreaterThan(1, DB::table('enrollments')->distinct()->count('user_id'));
        $this->assertNotNull($hrd->id);
    }

    public function test_second_run_does_not_duplicate(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);
        $email = DB::table('users')->where('id', $employee->id)->value('email');

        $this->prepareStand($company->id, $email);
        $this->seedDemo($company->id, $email);
        $before = [
            'courses'      => DB::table('courses')->count(),
            'lessons'      => DB::table('lessons')->count(),
            'enrollments'  => DB::table('enrollments')->count(),
            'lesson_progress' => DB::table('lesson_progress')->count(),
            'certificates' => DB::table('certificates')->count(),
            'idp_items'    => DB::table('idp_items')->count(),
            'gamification_levels' => DB::table('gamification_levels')->count(),
        ];

        $this->seedDemo($company->id, $email);

        foreach ($before as $table => $count) {
            $this->assertSame($count, DB::table($table)->count(), "повторный прогон размножил {$table}");
        }
    }
}
