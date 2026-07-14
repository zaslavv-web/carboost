<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrDocument extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'hr_documents';
    protected $fillable = [
        'company_id', 'created_by', 'owner_user_id', 'title', 'description', 'document_type',
        'file_url', 'file_name', 'scenario_id', 'extracted_data', 'processing_status',
        'valid_from', 'valid_until', 'is_confidential',
    ];
    protected $casts = [
        'extracted_data'  => 'array',
        'valid_from'      => 'date',
        'valid_until'     => 'date',
        'is_confidential' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->created_by) && ($u = auth()->user())) {
                $m->created_by = $u->id;
            }
        });
    }
}
