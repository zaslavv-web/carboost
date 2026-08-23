<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class HrdChecklistItem extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'hrd_checklist_items';
    protected $fillable = ['company_id', 'created_by', 'title', 'is_done', 'sort_order'];
    protected $casts = ['is_done' => 'boolean', 'sort_order' => 'integer'];
}