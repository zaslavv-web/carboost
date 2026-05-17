<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.notifications). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->text('title');
            $table->text('description')->nullable();
            $table->text('notification_type')->default('info');
            $table->boolean('is_read')->default(false);
            $table->uuid('company_id')->nullable();
            $table->timestamps(6);
            $table->primary('id');
        });
    }
    public function down(): void { Schema::dropIfExists('notifications'); }
};
