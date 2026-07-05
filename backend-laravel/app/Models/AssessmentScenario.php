<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AssessmentScenario extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'assessment_scenarios';
    protected $fillable = ['company_id', 'created_by', 'title', 'description', 'file_url', 'scenario_data', 'is_active'];
    protected $casts = ['scenario_data' => 'array', 'is_active' => 'boolean'];

    protected static function booted(): void
    {
        // FIX: колонка created_by NOT NULL — авто-заполняем текущим пользователем,
        // иначе CRUD POST /assessment-scenarios падал с 500.
        static::creating(function (self $m) {
            if (empty($m->created_by) && ($u = auth()->user())) {
                $m->created_by = $u->id;
            }
        });
    }
}
