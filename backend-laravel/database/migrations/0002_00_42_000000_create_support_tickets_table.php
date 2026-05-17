<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.support_tickets). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('support_tickets')) {
            Schema::create('support_tickets', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('subject');
            $table->text('description')->nullable();
            $table->text('priority')->default('medium');
            $table->text('status')->default('open');
            $table->uuid('company_id')->nullable();
            $table->text('admin_response')->nullable();
            $table->uuid('responded_by')->nullable();
            $table->timestamp('responded_at', 6)->nullable();
            $table->text('ai_suggestion')->nullable();
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('support_tickets'); }
};
