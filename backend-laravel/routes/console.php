<?php

use App\Support\ServiceInfra;
use Illuminate\Support\Facades\Schedule;

Schedule::command('mail:heartbeat')
    ->dailyAt(ServiceInfra::heartbeatTime())
    ->timezone(ServiceInfra::heartbeatTimezone())
    ->withoutOverlapping()
    ->onOneServer();

// Ежедневный пересчёт рисков сотрудников и алерты при переходе в high.
Schedule::command('risks:compute')
    ->dailyAt('03:30')
    ->withoutOverlapping()
    ->onOneServer();

