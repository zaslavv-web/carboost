<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TeamMemberSubstitution extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'team_member_substitutions';
    protected $fillable = [
        'original_user_id', 'substitute_user_id', 'company_id',
        'start_date', 'end_date', 'leave_request_id', 'notes',
    ];
    protected $casts = [
        'start_date' => 'date',
        'end_date'   => 'date',
    ];
}
