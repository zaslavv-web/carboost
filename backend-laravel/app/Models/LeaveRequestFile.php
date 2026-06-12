<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class LeaveRequestFile extends Model
{
    use HasUuids;

    protected $table = 'leave_request_files';
    protected $fillable = ['request_id', 'file_url', 'file_name', 'uploaded_by'];
}
