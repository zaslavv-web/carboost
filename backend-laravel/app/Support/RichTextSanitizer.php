<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

final class RichTextSanitizer
{
    private const TAGS = '<p><br><strong><em><u><s><h1><h2><h3><ul><ol><li><blockquote><code><pre><a><img><video><source><figure><figcaption><span>';

    public static function clean(?string $html): ?string
    {
        if ($html === null || trim($html) === '') return $html;
        $stripped = strip_tags($html, self::TAGS);
        if (! str_contains($stripped, '<')) return $stripped;

        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8" ?><div id="rich-root">' . $stripped . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $xpath = new DOMXPath($doc);
        foreach ($xpath->query('//*[@*]') ?: [] as $node) {
            if (! $node instanceof DOMElement) continue;
            foreach (iterator_to_array($node->attributes) as $attribute) {
                $name = strtolower($attribute->name);
                if (! in_array($name, ['href', 'target', 'rel', 'src', 'alt', 'title', 'controls', 'preload', 'style'], true)) {
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

        $root = $doc->getElementById('rich-root');
        if (! $root) return strip_tags($stripped, self::TAGS);
        $result = '';
        foreach ($root->childNodes as $child) $result .= $doc->saveHTML($child);
        return $result;
    }
}