<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Epic D3 — Предиктивная аналитика и бенчмаркинг:
 *  - attrition_predictions   — прогноз увольнения по сотруднику (вероятность, вклад драйверов)
 *  - attrition_model_metrics — качество модели (accuracy / precision / recall / AUC)
 *  - industry_benchmarks     — отраслевые бенчмарки (перцентили по метрикам)
 *  - whatif_scenarios        — сохранённые сценарии «что если»
 *  + companies.industry / companies.headcount_band — привязка компании к бенчмаркам
 */
return new class extends Migration {
    private function grant(string $table): void
    {
        try {
            DB::statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$table} TO PUBLIC");
        } catch (\Throwable) {
            // MySQL / окружения без прав — игнорируем.
        }
    }

    public function up(): void
    {
        if (!Schema::hasTable('attrition_predictions')) {
            Schema::create('attrition_predictions', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->uuid('user_id')->index();
                $t->unsignedSmallInteger('horizon_days')->default(180);
                $t->decimal('probability', 5, 4)->default(0);      // 0..1
                $t->string('band', 8)->default('low');             // low|medium|high
                $t->decimal('base_rate', 5, 4)->default(0);
                $t->json('features')->nullable();                  // сырые нормированные признаки
                $t->json('drivers')->nullable();                   // SHAP-подобные вклады
                $t->string('model_version', 32)->default('v1');
                $t->timestamp('computed_at')->nullable();
                $t->timestamps();
                $t->unique(['user_id', 'horizon_days'], 'attr_pred_user_horizon_uniq');
            });
            $this->grant('attrition_predictions');
        }

        if (!Schema::hasTable('attrition_model_metrics')) {
            Schema::create('attrition_model_metrics', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('model_version', 32)->default('v1');
                $t->decimal('accuracy', 5, 4)->nullable();
                $t->decimal('precision_score', 5, 4)->nullable();
                $t->decimal('recall', 5, 4)->nullable();
                $t->decimal('auc', 5, 4)->nullable();
                $t->unsignedInteger('sample_size')->default(0);
                $t->unsignedInteger('positives')->default(0);
                $t->string('status', 24)->default('ok');           // ok|insufficient_data
                $t->timestamp('evaluated_at')->nullable();
                $t->timestamps();
            });
            $this->grant('attrition_model_metrics');
        }

        if (!Schema::hasTable('industry_benchmarks')) {
            Schema::create('industry_benchmarks', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->string('industry', 64)->index();               // it|retail|manufacturing|finance|healthcare|all
                $t->string('headcount_band', 24)->default('all');  // <100|100-500|500-2000|2000+|all
                $t->string('metric', 64)->index();                 // turnover_rate|engagement|...
                $t->string('unit', 16)->default('percent');        // percent|days|hours|score
                $t->decimal('p25', 10, 2)->nullable();
                $t->decimal('p50', 10, 2)->nullable();
                $t->decimal('p75', 10, 2)->nullable();
                $t->boolean('lower_is_better')->default(true);
                $t->string('source', 120)->nullable();
                $t->string('period', 16)->nullable();              // 2025|2026H1
                $t->timestamps();
                $t->unique(['industry', 'headcount_band', 'metric'], 'bench_uniq');
            });
            $this->grant('industry_benchmarks');
            $this->seedBenchmarks();
        }

        if (!Schema::hasTable('whatif_scenarios')) {
            Schema::create('whatif_scenarios', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id')->index();
                $t->string('name', 160);
                $t->text('description')->nullable();
                $t->json('params')->nullable();
                $t->json('result')->nullable();
                $t->uuid('created_by')->nullable();
                $t->timestamps();
            });
            $this->grant('whatif_scenarios');
        }

        if (Schema::hasTable('companies')) {
            Schema::table('companies', function (Blueprint $t) {
                if (!Schema::hasColumn('companies', 'industry')) {
                    $t->string('industry', 64)->nullable();
                }
                if (!Schema::hasColumn('companies', 'headcount_band')) {
                    $t->string('headcount_band', 24)->nullable();
                }
                if (!Schema::hasColumn('companies', 'replacement_cost')) {
                    $t->integer('replacement_cost')->nullable(); // стоимость замены сотрудника, ₽
                }
            });
        }
    }

    /** Базовые отраслевые бенчмарки (открытые обзоры рынка труда РФ, 2025). */
    private function seedBenchmarks(): void
    {
        $now = now();
        $rows = [];
        $data = [
            // industry => [metric, unit, p25, p50, p75, lower_is_better]
            'it' => [
                ['turnover_rate', 'percent', 9, 14, 21, true],
                ['voluntary_turnover', 'percent', 6, 10, 16, true],
                ['engagement', 'score', 62, 71, 79, false],
                ['absenteeism', 'percent', 1.5, 2.4, 3.6, true],
                ['time_to_hire', 'days', 21, 34, 52, true],
                ['training_hours', 'hours', 18, 32, 48, false],
                ['internal_fill_rate', 'percent', 18, 29, 42, false],
            ],
            'retail' => [
                ['turnover_rate', 'percent', 28, 42, 61, true],
                ['voluntary_turnover', 'percent', 22, 34, 50, true],
                ['engagement', 'score', 52, 61, 70, false],
                ['absenteeism', 'percent', 3.0, 4.6, 6.8, true],
                ['time_to_hire', 'days', 9, 16, 27, true],
                ['training_hours', 'hours', 8, 15, 26, false],
                ['internal_fill_rate', 'percent', 12, 21, 33, false],
            ],
            'manufacturing' => [
                ['turnover_rate', 'percent', 14, 22, 33, true],
                ['voluntary_turnover', 'percent', 10, 17, 26, true],
                ['engagement', 'score', 54, 63, 72, false],
                ['absenteeism', 'percent', 2.8, 4.1, 5.9, true],
                ['time_to_hire', 'days', 18, 30, 46, true],
                ['training_hours', 'hours', 12, 22, 36, false],
                ['internal_fill_rate', 'percent', 15, 26, 38, false],
            ],
            'finance' => [
                ['turnover_rate', 'percent', 8, 13, 19, true],
                ['voluntary_turnover', 'percent', 5, 9, 14, true],
                ['engagement', 'score', 60, 69, 77, false],
                ['absenteeism', 'percent', 1.6, 2.6, 3.9, true],
                ['time_to_hire', 'days', 24, 38, 58, true],
                ['training_hours', 'hours', 16, 28, 44, false],
                ['internal_fill_rate', 'percent', 22, 34, 47, false],
            ],
            'healthcare' => [
                ['turnover_rate', 'percent', 15, 24, 36, true],
                ['voluntary_turnover', 'percent', 11, 18, 28, true],
                ['engagement', 'score', 55, 64, 73, false],
                ['absenteeism', 'percent', 3.2, 4.8, 7.1, true],
                ['time_to_hire', 'days', 20, 33, 50, true],
                ['training_hours', 'hours', 14, 26, 40, false],
                ['internal_fill_rate', 'percent', 14, 24, 36, false],
            ],
            'all' => [
                ['turnover_rate', 'percent', 12, 20, 31, true],
                ['voluntary_turnover', 'percent', 8, 15, 24, true],
                ['engagement', 'score', 56, 66, 75, false],
                ['absenteeism', 'percent', 2.2, 3.5, 5.2, true],
                ['time_to_hire', 'days', 18, 30, 48, true],
                ['training_hours', 'hours', 13, 24, 40, false],
                ['internal_fill_rate', 'percent', 16, 27, 39, false],
            ],
        ];

        foreach ($data as $industry => $metrics) {
            foreach ($metrics as [$metric, $unit, $p25, $p50, $p75, $lower]) {
                $rows[] = [
                    'id' => (string) \Illuminate\Support\Str::uuid(),
                    'industry' => $industry,
                    'headcount_band' => 'all',
                    'metric' => $metric,
                    'unit' => $unit,
                    'p25' => $p25,
                    'p50' => $p50,
                    'p75' => $p75,
                    'lower_is_better' => $lower,
                    'source' => 'Обзоры рынка труда РФ, агрегированные данные',
                    'period' => '2025',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 50) as $chunk) {
            DB::table('industry_benchmarks')->insert($chunk);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('whatif_scenarios');
        Schema::dropIfExists('industry_benchmarks');
        Schema::dropIfExists('attrition_model_metrics');
        Schema::dropIfExists('attrition_predictions');
    }
};
