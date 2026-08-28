<?php

namespace App\Integration;

use App\Models\ExternalReference;
use Illuminate\Support\Str;

/**
 * Сопоставление идентификаторов внешней системы и записей платформы.
 *
 * Внешняя система может адресовать запись своим ключом: `ext:1c_zup:00-12345`.
 * Соответствие хранится в external_references, поэтому повторный импорт одного
 * и того же объекта обновляет запись, а не создаёт дубликат.
 */
final class ExternalIdResolver
{
    /** Разбор идентификатора вида `ext:<system>:<external_id>`. */
    public static function parse(string $id): ?array
    {
        if (!str_starts_with($id, 'ext:')) {
            return null;
        }

        $rest = substr($id, 4);
        $sep = strpos($rest, ':');
        if ($sep === false || $sep === 0 || $sep === strlen($rest) - 1) {
            return null;
        }

        return [substr($rest, 0, $sep), substr($rest, $sep + 1)];
    }

    public static function internalId(string $companyId, string $system, string $resource, string $externalId): ?string
    {
        return ExternalReference::query()
            ->where('company_id', $companyId)
            ->where('system', $system)
            ->where('resource', $resource)
            ->where('external_id', $externalId)
            ->value('internal_id');
    }

    public static function link(string $companyId, string $system, string $resource, string $externalId, string $internalId): void
    {
        ExternalReference::query()->updateOrCreate(
            [
                'company_id'  => $companyId,
                'system'      => $system,
                'resource'    => $resource,
                'external_id' => $externalId,
            ],
            [
                'id'          => (string) Str::uuid(),
                'internal_id' => $internalId,
            ],
        );
    }

    /** Все внешние ключи записи — отдаём их в ответе, чтобы связь была видна. */
    public static function referencesFor(string $companyId, string $resource, string $internalId): array
    {
        return ExternalReference::query()
            ->where('company_id', $companyId)
            ->where('resource', $resource)
            ->where('internal_id', $internalId)
            ->get(['system', 'external_id'])
            ->map(static fn ($r) => ['system' => $r->system, 'external_id' => $r->external_id])
            ->all();
    }
}
