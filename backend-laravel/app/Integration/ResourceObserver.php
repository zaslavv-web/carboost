<?php

namespace App\Integration;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/**
 * Наблюдатель, вешаемый на каждую модель из реестра.
 *
 * Благодаря ему события уходят наружу при любой записи через Eloquent — из
 * пользовательского UI, из фоновых команд или из самого интеграционного API,
 * — без правки контроллеров каждого раздела.
 */
class ResourceObserver
{
    public function __construct(
        private readonly ResourceDefinition $definition,
        private readonly EventRecorder $recorder,
    ) {
    }

    public function created(Model $model): void
    {
        $this->emit('created', $model, $this->visible($model));
    }

    public function updated(Model $model): void
    {
        $changed = array_intersect_key($model->getChanges(), array_flip($this->definition->read));
        // Служебное поле updated_at меняется всегда — само по себе оно не повод
        // будить внешние системы.
        unset($changed['updated_at']);
        if ($changed === []) {
            return;
        }

        $this->emit('updated', $model, $this->visible($model) + ['changed' => array_keys($changed)]);
    }

    public function deleted(Model $model): void
    {
        $this->emit('deleted', $model, ['id' => $model->getKey()]);
    }

    private function emit(string $verb, Model $model, array $payload): void
    {
        try {
            $companyId = $this->definition->companyIdOf($model);
            if ($companyId === null || $companyId === '') {
                return;
            }

            $this->recorder->record(
                companyId: $companyId,
                resource: $this->definition->name,
                event: $this->definition->name . '.' . $verb,
                recordId: $model->getKey() === null ? null : (string) $model->getKey(),
                payload: $payload,
            );
        } catch (\Throwable $e) {
            // Запись события не должна ломать основную операцию продукта.
            Log::warning('integration.event_record_failed', [
                'resource' => $this->definition->name,
                'verb'     => $verb,
                'error'    => $e->getMessage(),
            ]);
        }
    }

    /** Наружу отдаём только поля, объявленные в реестре как читаемые. */
    private function visible(Model $model): array
    {
        return ResourcePresenter::present($this->definition, $model);
    }
}
