<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportTicket;
use Illuminate\Http\Request;

class SupportTicketController extends CrudController
{
    protected string $modelClass = SupportTicket::class;
    protected array $rules = [
        'user_id'     => 'required|uuid',
        'subject'     => 'required|string|max:255',
        'description' => 'nullable|string',
        'status'      => 'nullable|string|max:32',
        'priority'    => 'nullable|string|max:32',
        'category'    => 'nullable|string|max:64',
    ];

    protected function applyFilters($query, Request $request): void
    {
        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
    }
}
