<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\HrTaskAudienceController;
use PHPUnit\Framework\TestCase;

class HrTaskAudienceRulesTest extends TestCase
{
    public function test_normalize_trims_and_drops_empty_values(): void
    {
        $rules = HrTaskAudienceController::normalizeRules([
            'departments' => [' Продажи ', '', null, 'Продажи'],
            'position_ids' => ['abc', 'abc', ' '],
            'grades' => [],
            'unknown' => ['x'],
        ]);

        $this->assertSame(['Продажи'], $rules['departments']);
        $this->assertSame(['abc'], $rules['position_ids']);
        $this->assertArrayNotHasKey('grades', $rules);
        $this->assertArrayNotHasKey('unknown', $rules);
    }

    public function test_empty_input_produces_empty_rules(): void
    {
        $this->assertSame([], HrTaskAudienceController::normalizeRules([]));
    }
}
