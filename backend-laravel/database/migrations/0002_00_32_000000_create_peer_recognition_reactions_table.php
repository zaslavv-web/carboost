<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.peer_recognition_reactions). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('peer_recognition_reactions', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('recognition_id');
            $table->uuid('user_id');
            $table->text('reaction')->default('like');
            $table->timestamps(6);
            $table->primary('id');
            $table->index('recognition_id');
            $table->unique(["recognition_id", "user_id", "reaction"]);
        });
    }
    public function down(): void { Schema::dropIfExists('peer_recognition_reactions'); }
};
