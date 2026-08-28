<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Машинный ключ доступа компании к интеграционному API.
 *
 * Секрет в базе не хранится: только SHA-256 и публичный префикс, по которому
 * ключ находится за один индексный поиск. Полный токен показывается один раз
 * при создании.
 */
class ApiKey extends Model
{
    use HasUuids;

    protected $table = 'api_keys';

    protected $fillable = [
        'company_id', 'name', 'prefix', 'token_hash', 'scopes', 'ip_allowlist',
        'expires_at', 'last_used_at', 'last_used_ip', 'revoked_at', 'created_by',
    ];

    protected $casts = [
        'scopes'       => 'array',
        'ip_allowlist' => 'array',
        'expires_at'   => 'datetime',
        'last_used_at' => 'datetime',
        'revoked_at'   => 'datetime',
    ];

    protected $hidden = ['token_hash'];

    public function isUsable(): bool
    {
        if ($this->revoked_at !== null) {
            return false;
        }
        return $this->expires_at === null || $this->expires_at->isFuture();
    }
}
