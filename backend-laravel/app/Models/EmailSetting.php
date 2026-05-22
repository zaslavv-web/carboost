<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class EmailSetting extends Model
{
    use HasUuids;

    protected $table = 'email_settings';

    protected $fillable = [
        'provider',
        'host',
        'port',
        'encryption',
        'username',
        'password_encrypted',
        'from_address',
        'from_name',
        'reply_to_address',
        'is_active',
        'last_tested_at',
        'last_test_error',
        'created_by',
    ];

    protected $hidden = ['password_encrypted'];

    protected $casts = [
        'port' => 'integer',
        'is_active' => 'boolean',
        'last_tested_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function getPasswordAttribute(): ?string
    {
        if (!$this->password_encrypted) {
            return null;
        }

        try {
            return Crypt::decryptString($this->password_encrypted);
        } catch (\Illuminate\Contracts\Encryption\DecryptException $e) {
            \Illuminate\Support\Facades\Log::warning('EmailSetting password decrypt failed (APP_KEY changed?), falling back', [
                'id' => $this->id ?? null,
            ]);
            return null;
        }
    }

    public function hasUsablePassword(): bool
    {
        return $this->password !== null && $this->password !== '';
    }

    public function setPasswordAttribute(?string $value): void
    {
        if ($value !== null && $value !== '') {
            $this->attributes['password_encrypted'] = Crypt::encryptString($value);
        }
    }
}
