<?php

use App\Support\ServiceInfra;
use Illuminate\Support\Facades\Schedule;

Schedule::command('mail:heartbeat')
    ->dailyAt(ServiceInfra::heartbeatTime())
    ->timezone(ServiceInfra::heartbeatTimezone())
    ->withoutOverlapping()
    ->onOneServer();
