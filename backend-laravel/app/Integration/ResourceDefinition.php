<?php

namespace App\Integration;

use Closure;
use Illuminate\Database\Eloquent\Builder;

/**
 * Описание одного ресурса интеграционного API.
 *
 * Реестр декларативный: чтобы открыть наружу новый раздел продукта, достаточно
 * добавить сюда запись — маршруты, скоупы, события, OpenAPI и pull-фид
 * подхватят её автоматически.
 */
final class ResourceDefinition
{
    /**
     * @param string        $name       имя ресурса в URL (/api/v1/employees)
     * @param class-string  $model      Eloquent-модель
     * @param string        $scope      префикс скоупа ключа (employees:read / employees:write)
     * @param string[]      $read       поля, отдаваемые наружу
     * @param string[]      $write      поля, принимаемые извне
     * @param string[]      $filters    поля, доступные в качестве фильтров
     * @param string[]      $ops        list|read|create|update|delete
     * @param bool          $externalId у таблицы есть колонка external_id
     * @param Closure|null  $companyScope нестандартная привязка к компании
     */
    public function __construct(
        public readonly string $name,
        public readonly string $model,
        public readonly string $scope,
        public readonly string $title,
        public readonly array $read,
        public readonly array $write,
        public readonly array $filters,
        public readonly array $ops = ['list', 'read', 'create', 'update', 'delete'],
        public readonly bool $externalId = false,
        public readonly ?Closure $companyScope = null,
        public readonly ?Closure $companyResolver = null,
    ) {
    }

    /**
     * Компания записи. Для ресурсов без собственной колонки company_id
     * (например, enrollments) определяется через связанную сущность.
     */
    public function companyIdOf(object $model): ?string
    {
        if ($this->companyResolver !== null) {
            $resolved = ($this->companyResolver)($model);

            return $resolved === null ? null : (string) $resolved;
        }

        $companyId = $model->company_id ?? null;

        return $companyId === null ? null : (string) $companyId;
    }

    public function allows(string $op): bool
    {
        return in_array($op, $this->ops, true);
    }

    public function readScope(): string
    {
        return $this->scope . ':read';
    }

    public function writeScope(): string
    {
        return $this->scope . ':write';
    }

    /**
     * Запрос, жёстко ограниченный компанией.
     *
     * Глобальный CompanyScope опирается на auth()->user(), которого при доступе
     * по API-ключу нет, поэтому он снимается и компания задаётся явно — иначе
     * ключ одной компании видел бы чужие записи.
     */
    public function query(string $companyId): Builder
    {
        /** @var Builder $query */
        $query = ($this->model)::query()->withoutGlobalScopes();

        if ($this->companyScope !== null) {
            ($this->companyScope)($query, $companyId);
            return $query;
        }

        return $query->where($query->getModel()->getTable() . '.company_id', $companyId);
    }
}
