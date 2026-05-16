<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CompanyOnboardingSettings extends Model
{
    use HasUuids;

    protected $table = 'company_onboarding_settings';
    protected $fillable = [
        'company_id', 'welcome_bonus_enabled', 'welcome_bonus_amount',
        'auto_assign_tracks', 'auto_assign_tests',
    ];
    protected $casts = [
        'welcome_bonus_enabled' => 'boolean',
        'welcome_bonus_amount' => 'integer',
        'auto_assign_tracks' => 'boolean',
        'auto_assign_tests' => 'boolean',
    ];
}
