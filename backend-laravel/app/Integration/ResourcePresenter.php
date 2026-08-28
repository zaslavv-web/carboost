<?php

namespace App\Integration;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;

/**
 * Приведение записи к «внешнему» виду.
 *
 * Наружу попадают только поля из ResourceDefinition::$read — так добавление
 * колонки в таблицу не превращается в незаметную утечку данных в API.
 */
final class ResourcePresenter
{
    public static function present(ResourceDefinition $definition, Model $model): array
    {
        $out = [];
        foreach ($definition->read as $field) {
            if (!array_key_exists($field, $model->getAttributes()) && !$model->hasCast($field)) {
                continue;
            }

            $value = $model->getAttribute($field);
            $out[$field] = $value instanceof DateTimeInterface
                ? $value->format(DateTimeInterface::ATOM)
                : $value;
        }

        return $out;
    }
}
