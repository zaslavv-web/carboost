<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Achievement extends Model
{
    use HasUuids, BelongsToCompany;

    
    protected $table = 'achievements';
    public $timestamps = false; // только created_at
    protected $fillable = ['user_id', 'company_id', 'title', 'description', 'icon', 'achievement_date'];
    protected $casts = ['achievement_date' => 'date', 'created_at' => 'datetime'];
}
