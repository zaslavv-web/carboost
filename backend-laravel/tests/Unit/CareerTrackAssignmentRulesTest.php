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
}