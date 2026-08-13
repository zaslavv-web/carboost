<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Уведомление пользователя.
 *
 * Колонки таблицы (см. 0002_00_31_000000_create_notifications_table):
 *   id, user_id, title, description, notification_type, is_read, company_id,
 *   created_at, updated_at.
 *
 * Раньше модель объявляла несуществующие поля (message/type/link) и
 * $timestamps = false — из-за этого CRUD по /api/notifications и часть выборок
 * падали с «Unknown column».
 */
class Notification extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'company_id',
        'title',
        'description',
        'notification_type',
        'is_read',
    ];

    protected $casts = [
        'is_read'    => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
