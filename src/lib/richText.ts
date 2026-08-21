import DOMPurify from "dompurify";
import { marked } from "marked";

const HTML_PATTERN = /^\s*<(?:p|h[1-6]|ul|ol|blockquote|div|img|video|figure|pre|table)\b/i;

export function isRichHtml(value: string): boolean {
  return HTML_PATTERN.test(value);
}

export function sanitizeRichHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li",
      "blockquote", "code", "pre", "a", "img", "video", "source", "figure", "figcaption", "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "controls", "preload", "style"],
    ALLOW_DATA_ATTR: false,
  });
}

export function contentToSafeHtml(value: string): string {
  const html = isRichHtml(value) ? value : (marked.parse(value, { async: false }) as string);
  return sanitizeRichHtml(html);
}