<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'profiles';
    public $timestamps = true;

    protected $fillable = [
        'user_id', 'full_name', 'avatar_url', 'company_id',
        'department', 'position_id', 'is_verified', 'requested_role',
    ];

    protected $casts = [
        'is_verified' => 'boolean',
    ];

    protected static function booted(): void
    {
        // Динамическая аудитория HR-задач: при смене отдела/должности/грейда
        // сотрудник автоматически получает подходящие задачи.
        static::updated(function (self $m) {
            if (! $m->wasChanged(['department', 'position_id', 'grade'])) return;
            try {
                \App\Http\Controllers\Api\HrTaskAudienceController::syncCompany(
                    $m->company_id ? (string) $m->company_id : null,
                    (string) $m->user_id
                );
            } catch (\Throwable $e) {
                report($e);
            }
        });
    }


    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    public function company()
    {
        return $this->belongsTo(Company::class, 'company_id', 'id');
    }
}
