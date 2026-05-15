<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Только superadmin (см. RLS). Создаётся публично через DemoRequestService (минующий RLS). */
class DemoRequest extends Model
{
    use HasUuids;

    protected $table = 'demo_requests';
    protected $fillable = ['name', 'email', 'company', 'headcount', 'source', 'status', 'notes'];
    protected $casts = ['headcount' => 'integer'];
}
