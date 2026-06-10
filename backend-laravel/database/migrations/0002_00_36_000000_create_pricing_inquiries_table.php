<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.pricing_inquiries). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('pricing_inquiries')) {
            Schema::create('pricing_inquiries', function (Blueprint $table) {
            $table->uuid('id');
            $table->text('name');
            $table->text('email');
            $table->text('company')->nullable();
            $table->text('phone')->nullable();
            $table->text('plan');
            $table->integer('headcount')->nullable();
            $table->text('message')->nullable();
            $table->text('status')->default('new');
            $table->text('admin_notes')->nullable();
            $table->text('source')->nullable()->default('pricing_page');
            $table->timestamps(6);
            $table->primary('id');
        });
        }
    }
    public function down(): void { Schema::dropIfExists('pricing_inquiries'); }
};
