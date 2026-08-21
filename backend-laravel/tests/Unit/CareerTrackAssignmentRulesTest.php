<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CareerTrackAssignmentRulesTest extends TestCase
{
    public function test_assignment_source_does_not_randomly_skip_employees_or_choose_one_template(): void
    {
        $source = file_get_contents(__DIR__ . '/../../app/Console/Commands/SeedDemoCompany.php');

        $this->assertIsString($source);
        $methodStart = strpos($source, 'private function assignCareerTracks(): void');
        $methodEnd = strpos($source, 'private function trackStepsFor', $methodStart);
        $this->assertNotFalse($methodStart);
        $this->assertNotFalse($methodEnd);

        $method = substr($source, $methodStart, $methodEnd - $methodStart);
        $this->assertStringNotContainsString('random_int(1, 100) > 60', $method);
        $this->assertStringNotContainsString('$tpl = $candidates[array_rand($candidates)]', $method);
        $this->assertStringContainsString('foreach ($candidates as $tpl)', $method);
        $this->assertStringContainsString("$prof->user_id . '>' . (string) $tpl->id", $method);
    }
}