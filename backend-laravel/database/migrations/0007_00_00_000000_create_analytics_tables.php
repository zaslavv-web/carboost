<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('analytics_events')) {
            Schema::create('analytics_events', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->uuid('session_id')->index();
                $t->uuid('user_id')->nullable()->index();
                $t->uuid('company_id')->nullable()->index();
                $t->string('role', 32)->nullable();
                $t->uuid('impersonated_by')->nullable();
                $t->string('event_type', 32);   // page_view|action|api_call|api_error|js_error|session_start|session_end
                $t->string('event_name', 160)->index();
                $t->string('route', 255)->nullable();
                $t->string('path', 512)->nullable();
                $t->string('referrer', 512)->nullable();
                $t->string('component', 160)->nullable();
                $t->string('target', 255)->nullable();
                $t->integer('duration_ms')->nullable();
                $t->integer('status_code')->nullable();
                $t->json('properties')->nullable();
                $t->string('ua', 512)->nullable();
                $t->string('ip_hash', 64)->nullable();
                $t->string('app_version', 32)->nullable();
                $t->string('locale', 16)->nullable();
                $t->timestamp('occurred_at', 6)->nullable()->index();
                $t->timestamp('received_at', 6)->nullable();
                $t->index(['company_id', 'occurred_at'], 'idx_evt_company_time');
                $t->index(['event_name', 'occurred_at'], 'idx_evt_name_time');
            });
        }

        if (!Schema::hasTable('analytics_sessions')) {
            Schema::create('analytics_sessions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('user_id')->nullable()->index();
                $t->uuid('company_id')->nullable()->index();
                $t->string('role', 32)->nullable();
                $t->timestamp('started_at', 6)->nullable();
                $t->timestamp('last_seen_at', 6)->nullable();
                $t->timestamp('ended_at', 6)->nullable();
                $t->string('ended_reason', 32)->nullable(); // idle|navigation|crash|logout|beacon
                $t->integer('pages_count')->default(0);
                $t->integer('events_count')->default(0);
                $t->integer('errors_count')->default(0);
                $t->string('entry_route', 255)->nullable();
                $t->string('exit_route', 255)->nullable();
                $t->string('device', 32)->nullable();
                $t->string('viewport', 32)->nullable();
                $t->string('ua', 512)->nullable();
                $t->string('locale', 16)->nullable();
                $t->string('app_version', 32)->nullable();
                $t->timestamps(6);
                $t->index(['company_id', 'started_at'], 'idx_ses_company_time');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_events');
        Schema::dropIfExists('analytics_sessions');
    }
};
