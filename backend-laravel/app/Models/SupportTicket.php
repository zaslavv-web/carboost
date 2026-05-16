<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SupportTicket extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'support_tickets';
    protected $fillable = ['user_id', 'company_id', 'subject', 'message', 'status', 'priority', 'category', 'ai_tip'];
}
