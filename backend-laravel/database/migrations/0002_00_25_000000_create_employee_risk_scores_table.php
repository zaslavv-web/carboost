<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Auto-generated from legacy Postgres schema (public.employee_risk_scores). */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('employee_risk_scores')) {
            Schema::create('employee_risk_scores', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('user_id');
            $table->uuid('company_id');
            $table->integer('attrition_risk')->default(0);
            $table->integer('burnout_risk')->default(0);
            $table->integer('engagement_score')->default(50);
            $table->text('risk_level')->default('low');
            $table->json('factors')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->json('recommendations')->default(new \Illuminate\Database\Query\Expression("('[]')"));
            $table->timestamp('computed_at', 6)->useCurrent();
            $table->timestamps(6);
            $table->primary('id');
            $table->unique('user_id');
            $table->index(["company_id", "risk_level"]);
        });
        }
    }
    public function down(): void { Schema::dropIfExists('employee_risk_scores'); }
};
