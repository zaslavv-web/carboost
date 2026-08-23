<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

final class RichTextSanitizer
{
    private const TAGS = '<p><br><strong><em><u><s><h1><h2><h3><ul><ol><li><blockquote><code><pre><a><img><video><source><figure><figcaption><span>';

    private const ATTRS = ['href', 'target', 'rel', 'src', 'alt', 'title', 'controls', 'preload', 'style'];

    public static function clean(?string $html): ?string
    {
        if ($html === null || trim($html) === '') return $html;
        $stripped = strip_tags($html, self::TAGS);
        if (! str_contains($stripped, '<')) return $stripped;

        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        // Кодировку задаём числовыми сущностями: XML-пролог и LIBXML_HTML_NOIMPLIED
        // разбираются по-разному в разных версиях libxml и ломают выбор корня.
        $encoded = mb_encode_numericentity($stripped, [0x80, 0x10FFFF, 0, 0x1FFFFF], 'UTF-8');
        $loaded = $doc->loadHTML('<html><body><div id="rich-root">' . $encoded . '</div></body></html>');
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) return strip_tags($stripped, self::TAGS);

        $xpath = new DOMXPath($doc);
        $root = $xpath->query('//div[@id="rich-root"]')->item(0);
        if (! $root instanceof DOMElement) return strip_tags($stripped, self::TAGS);

        foreach ($xpath->query('.//*[@*]', $root) ?: [] as $node) {
            if (! $node instanceof DOMElement) continue;
            foreach (iterator_to_array($node->attributes) as $attribute) {
                $name = strtolower($attribute->name);
                if (! in_array($name, self::ATTRS, true)) {
                    $node->removeAttribute($attribute->name);
                    continue;
                }
                if (in_array($name, ['href', 'src'], true)) {
                    $url = trim($attribute->value);
                    if (! preg_match('#^(https?://|/|mailto:|tel:)#i', $url)) $node->removeAttribute($attribute->name);
                }
                if ($name === 'style') {
                    $safe = [];
                    foreach (explode(';', $attribute->value) as $declaration) {
                        if (preg_match('/^\s*(font-size|font-family)\s*:\s*([a-zA-Z0-9 ,."\'-]+)\s*$/', $declaration, $match)) {
                            $safe[] = strtolower($match[1]) . ': ' . $match[2];
                        }
                    }
                    $safe ? $node->setAttribute('style', implode('; ', $safe)) : $node->removeAttribute('style');
                }
            }
            if ($node->tagName === 'a') {
                $node->setAttribute('rel', 'noopener noreferrer');
                $node->setAttribute('target', '_blank');
            }
        }

        $result = '';
        foreach ($root->childNodes as $child) $result .= $doc->saveHTML($child);
        return $result;
    }
}
