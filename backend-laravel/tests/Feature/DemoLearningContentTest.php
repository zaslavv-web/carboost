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
     * Предпосылка, которую создаёт не эта команда, а `demo:seed`: без задач
     * трекера сидер считает стенд ненаполненным и падает своей проверкой.
     */
    private function prepareStand(string $companyId): void
    {
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

        $this->prepareStand($company->id);
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

    /**
     * На стенде с закрытым полугодием самый свежий цикл имеет статус
     * completed — команда обязана открыть новый, а не падать на собственной
     * проверке «нет активного performance-цикла», уже наполнив всё остальное.
     */
    public function test_closed_performance_cycle_does_not_block_seeding(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);
        $email = DB::table('users')->where('id', $employee->id)->value('email');

        DB::table('performance_cycles')->insert([
            'id' => (string) Str::uuid(), 'company_id' => $company->id,
            'title' => 'Закрытое полугодие', 'status' => 'completed',
            'period_start' => now()->subMonths(9)->toDateString(),
            'period_end' => now()->subMonths(3)->toDateString(),
            'created_at' => now()->subMonths(9), 'updated_at' => now()->subMonths(3),
        ]);

        $this->prepareStand($company->id);
        $this->seedDemo($company->id, $email);

        $this->assertSame(1, DB::table('performance_cycles')
            ->where('company_id', $company->id)->where('status', 'active')->count());
        // Закрытый цикл — история ревью, его статус трогать нельзя.
        $this->assertSame(1, DB::table('performance_cycles')
            ->where('company_id', $company->id)->where('status', 'completed')->count());
    }

    /**
     * Неудачный подбор компании должен быть диагностируемым.
     *
     * На стенде команда отвечала одной строкой «Компания не найдена. Укажите
     * --company=<id|название>» — и всё: ни что именно не нашлось, ни какие
     * компании есть. Подсказка здесь и есть предмет проверки.
     */
    public function test_unknown_company_is_explained(): void
    {
        $company = $this->makeCompany(['name' => 'Живая компания']);
        $this->makeUser('employee', $company->id);

        $this->artisan('demo:seed-extras', ['--company' => 'Компания-которой-нет'])
            ->expectsOutputToContain('Компания «Компания-которой-нет» не найдена')
            ->expectsOutputToContain('Доступные компании: Живая компания')
            ->assertExitCode(1);
    }

    /**
     * Компания без сообществ: наполнять было нечего, а проверка требовала
     * записей — команда падала на «в сообществах нет записей».
     */
    public function test_communities_are_created_when_absent(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);
        $email = DB::table('users')->where('id', $employee->id)->value('email');

        $this->assertSame(0, DB::table('portal_communities')->where('company_id', $company->id)->count());

        $this->prepareStand($company->id);
        $this->seedDemo($company->id, $email);

        $this->assertGreaterThanOrEqual(3, DB::table('portal_communities')->where('company_id', $company->id)->count());
        $this->assertGreaterThan(0, DB::table('portal_posts')
            ->where('company_id', $company->id)->whereNotNull('community_id')->count());
    }

    /**
     * Учётки из --email на стенде может не быть: команда наполняет найденную
     * компанию и проверяет по её сотруднику, а не падает на чужом email,
     * уже сделав всю работу.
     */
    public function test_unknown_email_falls_back_to_company_profile(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $this->makeUser('hrd', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);

        $this->prepareStand($company->id);

        $this->artisan('demo:seed-extras', [
            '--company' => $company->id,
            '--email' => 'employee.76@demo.pikrosta.ru',
        ])
            ->expectsOutputToContain('Учётки employee.76@demo.pikrosta.ru в этой компании нет')
            ->assertExitCode(0);

        $this->assertGreaterThan(0, DB::table('courses')->where('company_id', $company->id)->count());
    }

    public function test_second_run_does_not_duplicate(): void
    {
        $company = $this->makeCompany(['name' => 'Демо']);
        $this->makeUser('hrd', $company->id);
        $employee = $this->makeUser('employee', $company->id);
        for ($i = 0; $i < 10; $i++) $this->makeUser('employee', $company->id);
        $email = DB::table('users')->where('id', $employee->id)->value('email');

        $this->prepareStand($company->id);
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
