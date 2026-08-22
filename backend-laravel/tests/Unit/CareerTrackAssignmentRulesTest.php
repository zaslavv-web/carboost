<?php

namespace Tests\Unit;

use App\Console\Commands\SeedDemoCompany;
use PHPUnit\Framework\TestCase;

class CareerTrackAssignmentRulesTest extends TestCase
{
    public function test_employee_receives_all_missing_matching_templates_without_duplicates(): void
    {
        $this->assertSame(
            ['track-2', 'track-3'],
            SeedDemoCompany::missingTemplateIdsForEmployee(
                ['track-1', 'track-2', 'track-3', 'track-3'],
                ['track-1'],
            ),
        );

        $this->assertSame(
            [],
            SeedDemoCompany::missingTemplateIdsForEmployee(
                ['track-1', 'track-2', 'track-3'],
                ['track-1', 'track-2', 'track-3'],
            ),
        );
    }

    public function test_fallback_target_prefers_department_but_can_leave_single_position_department(): void
    {
        $this->assertSame(
            'position-2',
            SeedDemoCompany::fallbackTargetId(
                'position-1',
                ['position-1', 'position-2'],
                ['position-1', 'position-2', 'position-3'],
            ),
        );

        $this->assertSame(
            'position-3',
            SeedDemoCompany::fallbackTargetId(
                'position-1',
                ['position-1'],
                ['position-1', 'position-3'],
            ),
        );

        $this->assertNull(
            SeedDemoCompany::fallbackTargetId('position-1', ['position-1'], ['position-1']),
        );
    }
}