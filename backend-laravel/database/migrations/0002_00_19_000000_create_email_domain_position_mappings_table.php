<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from Supabase Postgres schema (public.email_domain_position_mappings). */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('email_domain_position_mappings', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('company_id')->nullable();
            $table->text('email_domain');
            $table->uuid('position_id');
            $table->uuid('created_by');
            $table->timestamps(6);
            $table->primary('id');
            $table->unique(["company_id", "email_domain"]);
        });
    }
    public function down(): void { Schema::dropIfExists('email_domain_position_mappings'); }
};
