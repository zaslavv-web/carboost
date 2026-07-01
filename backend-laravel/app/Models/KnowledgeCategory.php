<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class KnowledgeCategory extends Model
{
    use HasUuids, BelongsToCompany;

    protected $table = 'knowledge_categories';
    protected $fillable = ['company_id', 'parent_id', 'title', 'slug', 'order_index'];
    protected $casts = ['order_index' => 'integer'];

    public function articles()
    {
        return $this->hasMany(KnowledgeArticle::class, 'category_id');
    }
}
