<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class EmployeeReward extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'employee_rewards';
    public $timestamps = false;
    protected $fillable = ['user_id', 'company_id', 'reward_type_id', 'awarded_by', 'description'];
    protected $casts = ['awarded_at' => 'datetime', 'created_at' => 'datetime'];

    public function rewardType()
    {
        return $this->belongsTo(GamificationRewardType::class, 'reward_type_id');
    }
}
