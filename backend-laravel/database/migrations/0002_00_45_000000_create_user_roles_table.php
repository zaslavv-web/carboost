<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.user_roles). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_roles', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->string('role', 64) /* PG enum app_role */;
            $table->primary('id');
            $table->unique(["user_id", "role"]);
        });
    }
    public function down(): void { Schema::dropIfExists('user_roles'); }
};
