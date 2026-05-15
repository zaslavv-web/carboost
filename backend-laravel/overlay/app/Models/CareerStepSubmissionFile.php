<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** Файлы submission — авторизация через родителя, см. CareerStepSubmissionPolicy. */
class CareerStepSubmissionFile extends Model
{
    use HasUuids;

    protected $table = 'career_step_submission_files';
    public $timestamps = false;
    protected $fillable = ['submission_id', 'file_url', 'file_name', 'file_size'];
    protected $casts = ['file_size' => 'integer', 'uploaded_at' => 'datetime'];

    public function submission()
    {
        return $this->belongsTo(CareerStepSubmission::class, 'submission_id');
    }
}
