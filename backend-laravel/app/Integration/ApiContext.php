<?php

namespace App\Integration;

/**
 * Контекст запроса, пришедшего по API-ключу.
 *
 * Заменяет собой auth()->user() для машинных клиентов: компания берётся из
 * ключа, а не из сессии, поэтому все запросы ограничиваются явно.
 */
final class ApiContext
{
    /** @param string[] $scopes */
    public function __construct(
        public readonly string $keyId,
        public readonly string $companyId,
        public readonly array $scopes,
    ) {
    }

    public function hasScope(string $scope): bool
    {
        if (in_array('*', $this->scopes, true)) {
            return true;
        }

        if (in_array($scope, $this->scopes, true)) {
            return true;
        }

        // employees:* покрывает и чтение, и запись по домену.
        [$domain] = explode(':', $scope, 2);

        return in_array($domain . ':*', $this->scopes, true);
    }
}
