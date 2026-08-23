<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('role_permissions')) {
            Schema::create('role_permissions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->string('role', 32);
                $table->string('resource', 64);
                $table->boolean('can_view')->default(true);
                $table->boolean('can_edit')->default(false);
                $table->boolean('can_download')->default(false);
                $table->timestamps();
                $table->unique(['company_id', 'role', 'resource'], 'role_permissions_unique');
            });
        }

        if (! Schema::hasTable('role_change_log')) {
            Schema::create('role_change_log', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('user_id')->index();
                $table->string('old_role', 32)->nullable();
                $table->string('new_role', 32);
                $table->uuid('changed_by')->nullable();
                $table->timestamp('created_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('role_change_log');
    }
};
