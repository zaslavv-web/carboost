<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * public.users — перенос auth.users из Supabase под Laravel + Sanctum.
 * Колонки: email, encrypted_password (bcrypt из Supabase, читается Laravel нативно),
 * email_verified_at, meta (raw_user_meta_data), remember_token.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('password'); // bcrypt из Supabase
            $table->timestamp('email_verified_at', 6)->nullable();
            $table->json('meta')->nullable(); // raw_user_meta_data
            $table->string('remember_token', 100)->nullable();
            $table->timestamps(6);
            $table->index('email');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('users'); }
};
