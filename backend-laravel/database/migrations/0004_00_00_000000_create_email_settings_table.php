<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('email_settings')) {
            Schema::create('email_settings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('provider', 32)->default('custom');
                $table->string('host')->default('');
                $table->unsignedInteger('port')->default(587);
                $table->string('encryption', 16)->nullable()->default('tls');
                $table->string('username')->default('');
                $table->text('password_encrypted')->nullable();
                $table->string('from_address')->default('');
                $table->string('from_name')->default('Career Track');
                $table->string('reply_to_address')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_tested_at')->nullable();
                $table->text('last_test_error')->nullable();
                $table->string('created_by')->nullable();
                $table->timestamps(6);

                $table->index('is_active');
                $table->index('provider');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('email_settings');
    }
};
