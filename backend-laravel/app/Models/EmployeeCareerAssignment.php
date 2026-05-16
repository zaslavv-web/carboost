<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeCareerAssignment extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'employee_career_assignments';
    public $timestamps = false;
    protected $fillable = [
        'user_id', 'company_id', 'template_id', 'assigned_by',
        'status', 'current_step', 'personal_motivation',
    ];
    protected $casts = [
        'current_step' => 'integer',
        'assigned_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function template()
    {
        return $this->belongsTo(CareerTrackTemplate::class, 'template_id');
    }
}
