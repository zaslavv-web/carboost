<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('hrd_checklist_items')) {
            Schema::create('hrd_checklist_items', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->uuid('created_by');
                $table->string('title');
                $table->boolean('is_done')->default(false);
                $table->unsignedInteger('sort_order')->default(0);
                $table->timestamps();
                $table->index(['company_id', 'is_done']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hrd_checklist_items');
    }
};