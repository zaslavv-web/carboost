<?php

namespace App\Providers;

use App\Integration\EventRecorder;
use App\Integration\ResourceObserver;
use App\Integration\ResourceRegistry;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

/**
 * Подключает журналирование событий ко всем ресурсам реестра.
 *
 * Наблюдатель вешается на модель, а не на контроллер, поэтому наружу уходит
 * любое изменение — сделанное в UI, фоновой командой, импортом из 1С или самим
 * интеграционным API.
 */
class IntegrationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(EventRecorder::class);
    }

    public function boot(): void
    {
        // Готовность схемы здесь не проверяем: провайдер загружается раньше
        // миграций (в тестах — до RefreshDatabase), и ранняя проверка навсегда
        // оставила бы наблюдателей незарегистрированными. Отсутствие таблицы
        // ловится лениво в EventRecorder.
        $recorder = $this->app->make(EventRecorder::class);

        foreach (ResourceRegistry::all() as $definition) {
            $model = $definition->model;
            if (!class_exists($model)) {
                Log::warning('integration.model_missing', ['resource' => $definition->name, 'model' => $model]);
                continue;
            }

            $observer = new ResourceObserver($definition, $recorder);

            // Именно колбэки, а не Model::observe(): тот регистрирует класс по
            // имени и достаёт его из контейнера, а наблюдателю нужны аргументы
            // конструктора (описание ресурса).
            $model::created(static fn ($m) => $observer->created($m));
            $model::updated(static fn ($m) => $observer->updated($m));
            $model::deleted(static fn ($m) => $observer->deleted($m));
        }
    }
}
