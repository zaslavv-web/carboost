<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Http;
use Smalot\PdfParser\Parser as PdfParser;
use PhpOffice\PhpSpreadsheet\IOFactory as SpreadsheetIO;

/**
 * Replaces edge functions: parse-position-standards, parse-hr-document,
 * parse-org-structure, parse-test-document.
 *
 * Centralised file-content extraction (CSV/XLSX/PDF/text) + AI parsing.
 * For XLSX/PDF support, ensure phpoffice/phpspreadsheet and smalot/pdfparser are installed.
 */
class DocumentParserService
{
    public function __construct(protected AiGatewayService $ai)
    {
    }

    /** parse-position-standards */
    public function parsePositionStandards(string $fileUrl, string $fileName): array
    {
        $text = $this->extractText($fileUrl, $fileName);
        $sys = "Ты HR-аналитик. Из документа \"{$fileName}\" извлеки: 1) профиль компетенций (1-10), 2) психологический портрет. "
            . 'JSON: {"competencies":[{"name","required_level"}],"psychological_profile":[{"trait","level"}]}. '
            . 'Уровни черт: низкое, ниже среднего, среднее, выше среднего, высокое.';

        return $this->ai->chatJson(
            [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => "Содержимое файла:\n" . substr($text, 0, 80000)],
            ],
            ['competencies' => [], 'psychological_profile' => []],
        );
    }

    /** parse-hr-document — generic chunked HR doc analysis */
    public function parseHrDocument(string $fileUrl, string $fileName, string $documentType = 'general'): array
    {
        $text = $this->extractText($fileUrl, $fileName);
        $chunks = str_split($text, 8000);
        $sections = [];
        foreach (array_slice($chunks, 0, 10) as $i => $chunk) {
            $sys = "Ты HR-аналитик. Тип документа: {$documentType}. Извлеки структурированные данные из части документа. "
                . 'JSON: {"summary","sections":[{"title","content","tags":[]}],"key_facts":[]}';
            $parsed = $this->ai->chatJson(
                [
                    ['role' => 'system', 'content' => $sys],
                    ['role' => 'user', 'content' => "Часть #" . ($i + 1) . ":\n" . $chunk],
                ],
                ['summary' => '', 'sections' => [], 'key_facts' => []],
            );
            $sections[] = $parsed;
        }
        return ['file_name' => $fileName, 'chunks' => $sections];
    }

    /** parse-org-structure */
    public function parseOrgStructure(string $fileUrl, string $fileName): array
    {
        $text = $this->extractText($fileUrl, $fileName);
        $sys = 'Ты HR-аналитик. Извлеки иерархию отделов из документа. '
            . 'JSON: {"departments":[{"name","description","parent_name":null,"head_position":null}]}';
        return $this->ai->chatJson(
            [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => substr($text, 0, 80000)],
            ],
            ['departments' => []],
        );
    }

    /** parse-test-document */
    public function parseTestDocument(string $fileUrl, string $fileName): array
    {
        $text = $this->extractText($fileUrl, $fileName);
        $sys = 'Ты эксперт по образовательной оценке. Из документа извлеки тестовые вопросы. '
            . 'JSON: {"title","questions":[{"text","competency","options":[{"id","text"}],"correct_option_id"}]}';
        return $this->ai->chatJson(
            [
                ['role' => 'system', 'content' => $sys],
                ['role' => 'user', 'content' => substr($text, 0, 80000)],
            ],
            ['title' => $fileName, 'questions' => []],
        );
    }

    /** Returns plain text from a file URL, supporting CSV/XLSX/PDF/plain. */
    protected function extractText(string $url, string $fileName): string
    {
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $contents = Http::timeout(60)->get($url)->body();
        $tmp = tempnam(sys_get_temp_dir(), 'doc_');
        file_put_contents($tmp, $contents);

        try {
            if ($ext === 'csv' || $ext === 'txt') {
                return (string) $contents;
            }
            if (in_array($ext, ['xlsx', 'xls'], true) && class_exists(SpreadsheetIO::class)) {
                $sheet = SpreadsheetIO::load($tmp);
                $out = [];
                foreach ($sheet->getAllSheets() as $s) {
                    $out[] = "=== Лист: " . $s->getTitle() . " ===";
                    foreach ($s->toArray() as $row) {
                        $out[] = implode(',', array_map(fn ($v) => (string) $v, $row));
                    }
                }
                return implode("\n", $out);
            }
            if ($ext === 'pdf' && class_exists(PdfParser::class)) {
                return (new PdfParser())->parseFile($tmp)->getText();
            }
            return (string) $contents;
        } finally {
            @unlink($tmp);
        }
    }
}
