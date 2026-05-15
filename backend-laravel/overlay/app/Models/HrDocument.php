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
        'company_id', 'created_by', 'title', 'description', 'document_type',
        'file_url', 'file_name', 'scenario_id', 'extracted_data', 'processing_status',
    ];
    protected $casts = ['extracted_data' => 'array'];
}
