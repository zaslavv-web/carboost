<?php

namespace App\Http\Controllers\Api;

use App\Models\HrDocument;

class HrDocumentController extends CrudController
{
    protected string $modelClass = HrDocument::class;
    protected array $rules = [
        'title'             => 'required|string|max:255',
        'description'       => 'nullable|string',
        'document_type'     => 'nullable|string|max:64',
        'file_url'          => 'nullable|string',
        'file_name'         => 'nullable|string|max:255',
        'scenario_id'       => 'nullable|uuid',
        'extracted_data'    => 'nullable|array',
        'processing_status' => 'nullable|string|max:32',
    ];
}
