<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'notifications';
    public $timestamps = false;
    protected $fillable = ['user_id', 'company_id', 'title', 'message', 'type', 'is_read', 'link'];
    protected $casts = ['is_read' => 'boolean', 'created_at' => 'datetime'];
}
