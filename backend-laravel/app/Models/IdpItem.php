<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class IdpItem extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'idp_items';
    protected $fillable = [
        'company_id', 'idp_id', 'order_index', 'kind',
        'title', 'description', 'course_id', 'competency_id',
        'due_date', 'status', 'result_note',
    ];
    protected $casts = [
        'due_date'    => 'date',
        'order_index' => 'integer',
    ];
}
