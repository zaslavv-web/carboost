<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmailDomainPositionMapping extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'email_domain_position_mappings';
    protected $fillable = ['email_domain', 'position_id', 'company_id', 'created_by'];

    public function position()
    {
        return $this->belongsTo(Position::class, 'position_id');
    }

    /** Алиас для фронта: HRDDashboard запрашивает связь как `positions(...)`. */
    public function positions()
    {
        return $this->belongsTo(Position::class, 'position_id');
    }
}

