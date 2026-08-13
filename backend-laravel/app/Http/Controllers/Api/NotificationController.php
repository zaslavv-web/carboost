<?php

namespace App\Http\Controllers\Api;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends CrudController
{
    protected string $modelClass = Notification::class;

    /** Валидация под реальные колонки таблицы notifications. */
    protected array $rules = [
        'user_id'           => 'required|uuid',
        'notification_type' => 'required|string|max:64',
        'title'             => 'required|string|max:255',
        'description'       => 'nullable|string',
    ];

    protected function applyFilters($query, Request $request): void
    {
        $query->where('user_id', auth()->id())->orderByDesc('created_at');
        if ($request->boolean('unread')) {
            $query->where('is_read', false);
        }
    }

    public function markRead(string $id): JsonResponse
    {
        $n = Notification::findOrFail($id);
        $this->authorize('update', $n);
        $n->update(['is_read' => true]);
        return response()->json($n);
    }
}
