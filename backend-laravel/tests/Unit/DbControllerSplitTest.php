<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\DbController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class DbControllerSplitTest extends TestCase
{
    private function splitTopLevel(string $s, string $sep): array
    {
        $ctrl = new DbController();
        $m = new ReflectionMethod($ctrl, 'splitTopLevel');
        $m->setAccessible(true);
        return $m->invoke($ctrl, $s, $sep);
    }

    public function test_splits_simple_csv(): void
    {
        $this->assertSame(['a', 'b', 'c'], $this->splitTopLevel('a,b,c', ','));
    }

    public function test_does_not_split_inside_parens(): void
    {
        $this->assertSame(
            ['col', 'rel(a,b)', 'rel2(*)'],
            $this->splitTopLevel('col,rel(a,b),rel2(*)', ','),
        );
    }

    public function test_handles_nested_parens(): void
    {
        $this->assertSame(
            ['x', 'y(a(1,2),b)'],
            $this->splitTopLevel('x,y(a(1,2),b)', ','),
        );
    }
}
