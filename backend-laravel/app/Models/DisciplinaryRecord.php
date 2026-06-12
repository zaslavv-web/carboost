<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DisciplinaryRecord extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'disciplinary_records';
    protected $fillable = [
        'user_id', 'company_id', 'type', 'severity',
        'issued_by', 'issued_at', 'valid_until', 'reason',
        'status', 'closed_at', 'closed_by', 'closure_reason',
    ];
    protected $casts = [
        'issued_at'   => 'datetime',
        'valid_until' => 'date',
        'closed_at'   => 'datetime',
    ];

    public function criteria()
    {
        return $this->hasMany(DisciplinaryCriterion::class, 'record_id');
    }
}
