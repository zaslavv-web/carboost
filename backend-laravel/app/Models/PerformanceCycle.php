<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class PerformanceCycle extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'performance_cycles';
    protected $fillable = [
        'company_id', 'title', 'period_start', 'period_end',
        'deadline', 'status', 'weights', 'created_by',
    ];
    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
        'deadline'     => 'date',
        'weights'      => 'array',
    ];

    public function reviews()
    {
        return $this->hasMany(PerformanceReview::class, 'cycle_id');
    }
}
