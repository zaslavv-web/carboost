<?php

namespace Tests\Unit;

use App\Support\RichTextSanitizer;
use PHPUnit\Framework\TestCase;

class RichTextSanitizerTest extends TestCase
{
    public function test_keeps_supported_formatting_and_removes_executable_html(): void
    {
        $clean = RichTextSanitizer::clean('<h2>Заголовок</h2><script>alert(1)</script><p onclick="bad()"><a href="javascript:bad()">ссылка</a><img src="https://example.test/a.png" onerror="bad()"></p>');

        $this->assertStringContainsString('<h2>Заголовок</h2>', $clean);
        $this->assertStringNotContainsString('<script', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
        $this->assertStringNotContainsString('onerror', $clean);
        $this->assertStringContainsString('https://example.test/a.png', $clean);
    }
}