<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Внутренняя валюта: баланс, история, способы заработать и переводы между
 * сотрудниками одной компании. Только raw SQL (без Eloquent-гидрации).
 */
class CurrencyController extends Controller
{
    public function balance(Request $request): JsonResponse
    {
        $userId = $this->userId($request);
        $companyId = $this->companyId($request);
        if (!$userId) return response()->json(['data' => ['balance' => 0]]);

        $balance = (int) (DB::table('currency_balances')
            ->where('user_id', $userId)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->value('balance') ?? 0);

        $settings = $companyId
            ? DB::table('company_currency_settings')->where('company_id', $companyId)->first()
            : null;

        return response()->json(['data' => [
            'balance'  => $balance,
            'settings' => [
                'currency_name'          => $settings->currency_name ?? 'Монеты',
                'currency_icon'          => $settings->currency_icon ?? '🪙',
                'transfers_enabled'      => (bool) ($settings->transfers_enabled ?? true),
                'transfer_limit_per_day' => (int) ($settings->transfer_limit_per_day ?? 1000),
            ],
            'spent_today' => $this->spentToday($userId),
        ]]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $userId = $this->userId($request);
        if (!$userId) return response()->json(['data' => []]);
        $limit = max(1, min(100, (int) $request->query('limit', 20)));

        $rows = DB::table('currency_transactions')
            ->select('id', 'amount', 'kind', 'description', 'created_at')
            ->where('user_id', $userId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** Способы заработать: активные правила награждения компании. */
    public function earnRules(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        if (!$companyId || !Schema::hasTable('gamification_reward_types')) {
            return response()->json(['data' => []]);
        }

        $rows = DB::table('gamification_reward_types')
            ->select('id', 'title', 'description', 'category', 'icon', 'points', 'reward_kind', 'trigger_mode')
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->orderByDesc('points')
            ->limit(100)
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** Коллеги своей компании — для выбора получателя перевода. */
    public function recipients(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $userId = $this->userId($request);
        if (!$companyId) return response()->json(['data' => []]);

        $search = trim((string) $request->query('search', ''));
        $rows = DB::table('profiles')
            ->select('user_id', 'full_name', 'position', 'department', 'avatar_url')
            ->where('company_id', $companyId)
            ->when($userId, fn ($q) => $q->where('user_id', '!=', $userId))
            ->when($search !== '', fn ($q) => $q->where('full_name', 'like', '%' . $search . '%'))
            ->orderBy('full_name')
            ->limit(50)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function transfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            // id пользователей в этой БД могут быть как uuid, так и числовыми
            'recipient_id' => 'required|string|max:64',
            'amount'       => 'required|integer|min:1|max:1000000',
            'message'      => 'nullable|string|max:300',
        ]);

        $userId = $this->userId($request);
        $companyId = $this->companyId($request);
        if (!$userId || !$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }
        if ($data['recipient_id'] === $userId) {
            return response()->json(['ok' => false, 'message' => 'Нельзя переводить самому себе.'], 422);
        }

        $recipient = DB::table('profiles')
            ->select('user_id', 'full_name', 'company_id')
            ->where('user_id', $data['recipient_id'])
            ->first();
        if (!$recipient || (string) $recipient->company_id !== (string) $companyId) {
            return response()->json(['ok' => false, 'message' => 'Получатель не найден в вашей компании.'], 422);
        }

        $settings = DB::table('company_currency_settings')->where('company_id', $companyId)->first();
        if ($settings && isset($settings->transfers_enabled) && !$settings->transfers_enabled) {
            return response()->json(['ok' => false, 'message' => 'Переводы отключены администратором компании.'], 422);
        }
        $limit = (int) ($settings->transfer_limit_per_day ?? 1000);
        $amount = (int) $data['amount'];

        if ($limit > 0 && $this->spentToday($userId) + $amount > $limit) {
            return response()->json([
                'ok' => false,
                'message' => "Превышен дневной лимит переводов ({$limit}).",
            ], 422);
        }

        $senderName = (string) (DB::table('profiles')->where('user_id', $userId)->value('full_name') ?? 'Коллега');
        $note = trim((string) ($data['message'] ?? ''));

        try {
            DB::transaction(function () use ($userId, $companyId, $recipient, $amount, $note, $senderName) {
                $balance = (int) (DB::table('currency_balances')
                    ->where('user_id', $userId)->where('company_id', $companyId)
                    ->lockForUpdate()->value('balance') ?? 0);
                if ($balance < $amount) {
                    abort(422, 'Недостаточно средств на балансе.');
                }

                $now = now();
                $ref = (string) Str::uuid();

                DB::table('currency_transactions')->insert([
                    [
                        'id' => (string) Str::uuid(),
                        'user_id' => $userId,
                        'company_id' => $companyId,
                        'amount' => -$amount,
                        'kind' => 'transfer_out',
                        'reference_id' => $ref,
                        'description' => 'Перевод: ' . $recipient->full_name . ($note !== '' ? ' — ' . $note : ''),
                        'created_by' => $userId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                    [
                        'id' => (string) Str::uuid(),
                        'user_id' => (string) $recipient->user_id,
                        'company_id' => $companyId,
                        'amount' => $amount,
                        'kind' => 'transfer_in',
                        'reference_id' => $ref,
                        'description' => 'Перевод от ' . $senderName . ($note !== '' ? ' — ' . $note : ''),
                        'created_by' => $userId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                ]);

                DB::table('currency_balances')
                    ->where('user_id', $userId)->where('company_id', $companyId)
                    ->update(['balance' => $balance - $amount, 'updated_at' => $now]);

                $exists = DB::table('currency_balances')
                    ->where('user_id', $recipient->user_id)->where('company_id', $companyId)
                    ->lockForUpdate()->first();
                if ($exists) {
                    DB::table('currency_balances')
                        ->where('user_id', $recipient->user_id)->where('company_id', $companyId)
                        ->update(['balance' => (int) $exists->balance + $amount, 'updated_at' => $now]);
                } else {
                    DB::table('currency_balances')->insert([
                        'id' => (string) Str::uuid(),
                        'user_id' => (string) $recipient->user_id,
                        'company_id' => $companyId,
                        'balance' => $amount,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }

        $newBalance = (int) (DB::table('currency_balances')
            ->where('user_id', $userId)->where('company_id', $companyId)->value('balance') ?? 0);

        return response()->json(['ok' => true, 'data' => ['balance' => $newBalance]]);
    }

    private function spentToday(string $userId): int
    {
        $sum = DB::table('currency_transactions')
            ->where('user_id', $userId)
            ->where('kind', 'transfer_out')
            ->where('created_at', '>=', now()->startOfDay())
            ->sum('amount');
        return (int) abs((int) $sum);
    }

    private function userId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        return (string) $user->getAuthIdentifier();
    }

    private function companyId(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) return null;
        try {
            if (method_exists($user, 'companyId')) {
                $cid = $user->companyId();
                if ($cid) return (string) $cid;
            }
        } catch (\Throwable) {
            // fall through
        }
        if (Schema::hasTable('profiles')) {
            $cid = DB::table('profiles')->where('user_id', $this->userId($request))->value('company_id');
            if ($cid) return (string) $cid;
        }
        return null;
    }
}
