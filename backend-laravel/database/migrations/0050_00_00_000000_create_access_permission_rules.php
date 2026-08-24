<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('access_permission_rules')) {
            Schema::create('access_permission_rules', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->string('subject_type', 24);
                $table->string('subject_id', 191);
                $table->string('resource', 64);
                $table->boolean('can_view')->default(false);
                $table->boolean('can_edit')->default(false);
                $table->boolean('can_download')->default(false);
                $table->uuid('updated_by')->nullable();
                $table->timestamps();
                $table->unique(['company_id', 'subject_type', 'subject_id', 'resource'], 'access_rules_subject_resource_unique');
            });
        }
        if (! Schema::hasTable('access_permission_log')) {
            Schema::create('access_permission_log', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->string('subject_type', 24);
                $table->string('subject_id', 191);
                $table->string('resource', 64);
                $table->json('before_value')->nullable();
                $table->json('after_value')->nullable();
                $table->uuid('changed_by')->nullable();
                $table->timestamp('created_at')->nullable();
            });
        }

        if (Schema::hasTable('role_permissions')) {
            foreach (DB::table('role_permissions')->get() as $row) {
                DB::table('access_permission_rules')->updateOrInsert([
                    'company_id' => $row->company_id, 'subject_type' => 'role',
                    'subject_id' => $row->role, 'resource' => $row->resource,
                ], [
                    'id' => (string) Str::uuid(), 'can_view' => $row->can_view,
                    'can_edit' => $row->can_edit, 'can_download' => $row->can_download,
                    'created_at' => $row->created_at ?? now(), 'updated_at' => $row->updated_at ?? now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('access_permission_log');
        Schema::dropIfExists('access_permission_rules');
    }
};