<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('impersonation_audit')) {
            Schema::create('impersonation_audit', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('actor_user_id');
            $table->uuid('target_user_id');
            $table->unsignedBigInteger('token_id')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();

            $table->index(['actor_user_id', 'started_at']);
            $table->index('target_user_id');
        });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('impersonation_audit');
    }
};
