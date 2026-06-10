<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.peer_recognitions). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('peer_recognitions')) {
            Schema::create('peer_recognitions', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id');
            $table->uuid('from_user_id');
            $table->uuid('to_user_id');
            $table->text('category')->default('thanks');
            $table->text('message');
            $table->integer('coin_reward')->default(0);
            $table->timestamps(6);
            $table->primary('id');
            $table->index(["company_id", "created_at"]);
            $table->index('from_user_id');
            $table->index('to_user_id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('peer_recognitions'); }
};
