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

    public function test_keeps_nested_lists_and_cyrillic_text(): void
    {
        $clean = RichTextSanitizer::clean('<ul><li>Первый<ol><li>Вложенный</li></ol></li></ul>');

        $this->assertStringContainsString('<ul>', $clean);
        $this->assertStringContainsString('<ol>', $clean);
        $this->assertStringContainsString('Вложенный', $clean);
    }

    public function test_style_whitelist(): void
    {
        $clean = RichTextSanitizer::clean('<p style="font-size: 14px">a</p><p style="position: fixed">b</p>');

        $this->assertStringContainsString('font-size: 14px', $clean);
        $this->assertStringNotContainsString('position', $clean);
    }

    public function test_links_get_safe_rel_and_target(): void
    {
        $clean = RichTextSanitizer::clean('<p><a href="https://example.test">тут</a></p>');

        $this->assertStringContainsString('rel="noopener noreferrer"', $clean);
        $this->assertStringContainsString('target="_blank"', $clean);
    }
}
