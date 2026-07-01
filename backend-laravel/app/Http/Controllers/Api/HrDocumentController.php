<?php

namespace App\Http\Controllers\Api;

use App\Models\HrDocument;
use Illuminate\Http\Request;

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
        'owner_user_id'     => 'nullable|uuid',
        'valid_from'        => 'nullable|date',
        'valid_until'       => 'nullable|date',
        'is_confidential'   => 'nullable|boolean',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($ownerId = $request->get('owner_user_id')) {
            $query->where('owner_user_id', $ownerId);
        }
        if ($type = $request->get('document_type')) {
            $query->where('document_type', $type);
        }
        // "personal" — все документы с owner_user_id (персональные дела)
        if ($request->boolean('personal_only')) {
            $query->whereNotNull('owner_user_id');
        }
        // "strategic" — документы без владельца (политики/стратегии компании)
        if ($request->boolean('strategic_only')) {
            $query->whereNull('owner_user_id');
        }
        // Скоро истекают (в течение N дней)
        if ($days = (int) $request->get('expiring_within_days', 0)) {
            $query->whereNotNull('valid_until')
                ->whereBetween('valid_until', [now()->toDateString(), now()->addDays($days)->toDateString()]);
        }
        $query->orderByDesc('created_at');
    }
}
