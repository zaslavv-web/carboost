<?php

namespace App\Http\Controllers\Api;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends CrudController
{
    protected string $modelClass = Notification::class;
    protected array $rules = [
        'user_id' => 'required|uuid',
        'type'    => 'required|string|max:64',
        'title'   => 'required|string|max:255',
        'message' => 'nullable|string',
        'data'    => 'nullable|array',
    ];

    protected function applyFilters($query, Request $request): void
    {
        $query->where('user_id', auth()->id())->orderByDesc('created_at');
        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }
    }

    public function markRead(string $id): JsonResponse
    {
        $n = Notification::findOrFail($id);
        $this->authorize('update', $n);
        $n->update(['read_at' => now()]);
        return response()->json($n);
    }
}
