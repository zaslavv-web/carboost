<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\DemoRequestSubmitted;
use App\Mail\EmployeeInvited;
use App\Services\EmailConfigService;
use Illuminate\Support\Facades\Log;
use App\Mail\PricingInquirySubmitted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Generic Postgres RPC proxy (Phase 10).
 *
 * Drop-in replacement for `legacy.rpc(name, params)`. Whitelisted Postgres
 * functions are invoked through the SECURITY DEFINER chain — they already
 * enforce role/company checks via `auth.uid()`, which we set per-request
 * using `set_config('request.jwt.claim.sub', ...)` so existing functions
 * keep working unchanged after the migration.
 */
class RpcController extends Controller
{
    /**
     * name => [param_name => sql_type] in declared order.
     * sql_type is used only to cast NULL → typed NULL when the caller omits it.
     */
    protected const FUNCTIONS = [
        'verify_user'                    => ['_target_user_id' => 'uuid'],
        'reject_user'                    => ['_target_user_id' => 'uuid'],
        'delete_user'                    => ['_target_user_id' => 'uuid'],
        'assign_role'                    => ['_target_user_id' => 'uuid', '_role' => 'text'],
        'register_company'               => ['_name' => 'text'],
        'find_company_by_name'           => ['_name' => 'text'],
        'bulk_invite_employees'          => ['_invites' => 'jsonb'],
        'resend_invitation'              => ['_invitation_id' => 'text'],
        'submit_employee_questionnaire'  => [
            '_questionnaire_id' => 'uuid', '_position_id' => 'uuid',
            '_other_position_title' => 'text', '_answers' => 'jsonb',
            '_skill_gaps' => 'jsonb', '_status' => 'text',
        ],
        'submit_career_step'             => [
            '_assignment_id' => 'uuid', '_step_order' => 'int',
            '_payload' => 'jsonb',
        ],
        'review_career_step'             => [
            '_submission_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text',
        ],
        'create_shop_order'              => ['_items' => 'jsonb'],
        'fulfill_shop_order'             => [
            '_order_id' => 'uuid', '_approve' => 'bool', '_reason' => 'text',
        ],
        'award_currency'                 => [
            '_user_id' => 'uuid', '_company_id' => 'uuid', '_amount' => 'int',
            '_kind' => 'text', '_description' => 'text', '_reference_id' => 'uuid',
        ],
        'submit_demo_request'            => [
            '_name' => 'text', '_email' => 'text', '_company' => 'text',
            '_headcount' => 'int', '_source' => 'text',
        ],
        'submit_pricing_inquiry'         => [
            '_name' => 'text', '_email' => 'text', '_plan' => 'text',
            '_company' => 'text', '_phone' => 'text', '_headcount' => 'int',
            '_message' => 'text', '_source' => 'text',
        ],
    ];

    public function call(Request $request, string $name)
    {
        if (! isset(self::FUNCTIONS[$name])) {
            return response()->json(['error' => "RPC '$name' не зарегистрирован"], 404);
        }

        $signature = self::FUNCTIONS[$name];
        $payload = $request->input('params', $request->all());
        if (! is_array($payload)) {
            $payload = [];
        }

        if (in_array($name, ['verify_user', 'reject_user', 'delete_user', 'assign_role'], true)) {
            return $this->callLocalUserAdminFunction($request, $name, $payload);
        }

        if ($name === 'submit_demo_request') {
            return $this->submitDemoRequest($payload);
        }
        if ($name === 'submit_pricing_inquiry') {
            return $this->submitPricingInquiry($payload);
        }

        if ($name === 'bulk_invite_employees') {
            return $this->bulkInviteEmployees($request, $payload);
        }

        if ($name === 'resend_invitation') {
            return $this->resendInvitation($request, $payload);
        }


        $args = [];
        $placeholders = [];
        foreach ($signature as $param => $type) {
            $value = $payload[$param] ?? $payload[ltrim($param, '_')] ?? null;
            if (in_array($type, ['jsonb', 'json'], true) && $value !== null && ! is_string($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
            $args[] = $value;
            $placeholders[] = "?::{$type}";
        }

        $sql = sprintf('select public.%s(%s) as result', $name, implode(', ', $placeholders));

        try {
            // Propagate the authenticated user as auth.uid() inside SECURITY DEFINER funcs
            $userId = optional($request->user())->getAuthIdentifier();
            if ($userId) {
                DB::statement("select set_config('request.jwt.claim.sub', ?, true)", [(string) $userId]);
            }

            $rows = DB::select($sql, $args);
            $value = $rows[0]->result ?? null;
            if (is_string($value) && $value !== '' && in_array($value[0], ['{', '['], true)) {
                $decoded = json_decode($value, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $value = $decoded;
                }
            }
            return response()->json(['data' => $value]);
        } catch (Throwable $e) {
            $msg = self::localize($e->getMessage());
            return response()->json(['error' => $msg], 422);
        }
    }

    private function callLocalUserAdminFunction(Request $request, string $name, array $payload)
    {
        $actor = $request->user();
        $targetId = (string) ($payload['_target_user_id'] ?? $payload['target_user_id'] ?? '');
        $role = (string) ($payload['_role'] ?? $payload['role'] ?? $payload['_new_role'] ?? $payload['new_role'] ?? '');

        if ($targetId === '') {
            return response()->json(['error' => 'Не указан пользователь'], 422);
        }

        try {
            $profile = $this->findProfileByDomainId($targetId);
            if (!$profile) {
                return response()->json(['error' => 'Пользователь не найден'], 404);
            }

            if (!$this->canManageTarget($actor, $profile)) {
                return response()->json(['error' => 'Недостаточно прав'], 403);
            }

            return match ($name) {
                'verify_user' => $this->verifyUser($profile),
                'reject_user' => $this->rejectUser($profile),
                'assign_role' => $this->assignRole($actor, $profile, $role),
                'delete_user' => $this->deleteUser($actor, $profile),
            };
        } catch (Throwable $e) {
            return response()->json(['error' => self::localize($e->getMessage())], 422);
        }
    }

    private function bulkInviteEmployees(Request $request, array $payload)
    {
        $actor = $request->user();
        if (!$actor) {
            return response()->json(['error' => 'Не авторизован'], 401);
        }

        if (!$actor->hasRole(['hrd', 'company_admin', 'superadmin', 'manager'])) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $companyId = method_exists($actor, 'companyId') ? $actor->companyId() : null;
        // Fallback: если у профиля утерян company_id — пытаемся вытащить через должность/отдел
        if (!$companyId) {
            $actorDomainId = method_exists($actor, 'domainUserId') ? $actor->domainUserId() : $actor->id;
            $prof = DB::table('profiles')->where('user_id', $actorDomainId)->first();
            if ($prof) {
                if (!empty($prof->position_id)) {
                    $companyId = DB::table('positions')->where('id', $prof->position_id)->value('company_id');
                }
                if (!$companyId && property_exists($prof, 'department_id') && !empty($prof->department_id)) {
                    $companyId = DB::table('departments')->where('id', $prof->department_id)->value('company_id');
                }
                if ($companyId) {
                    // самолечение: дописать company_id обратно в профиль, чтобы больше не всплывало
                    DB::table('profiles')->where('user_id', $actorDomainId)->update([
                        'company_id' => $companyId,
                        'updated_at' => now(),
                    ]);
                }
            }
        }
        if (!$companyId) {
            return response()->json([
                'error' => 'У вашего профиля не указана компания. Обратитесь к администратору или запустите: php artisan org:fix-company-links --company-name=<Ваша компания>',
                'code'  => 'missing_company',
            ], 422);
        }

        $invites = $payload['_invites'] ?? $payload['invites'] ?? [];
        if (!is_array($invites)) {
            return response()->json(['error' => 'Некорректный список приглашений'], 422);
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
        $pendingSends = []; // [ [row, rawToken] ]

        DB::transaction(function () use ($invites, $actor, $companyId, &$created, &$updated, &$skipped, &$errors, &$pendingSends) {
            foreach ($invites as $i => $invite) {
                if (!is_array($invite)) {
                    $skipped++;
                    $errors[] = ['row' => $i + 1, 'email' => null, 'error' => 'Некорректная строка приглашения'];
                    continue;
                }

                $email = strtolower(trim((string) ($invite['email'] ?? '')));
                if ($email === '') {
                    $skipped++;
                    $errors[] = ['row' => $i + 1, 'email' => null, 'error' => 'Пустой email — укажите адрес получателя'];
                    continue;
                }
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $skipped++;
                    $errors[] = ['row' => $i + 1, 'email' => $email, 'error' => 'Некорректный email: проверьте формат (пример: name@example.com)'];
                    continue;
                }
                // Проверка доменной части: MX или A-запись. Если домена нет —
                // письмо гарантированно не дойдёт, лучше сразу сказать об этом.
                $domain = substr(strrchr($email, '@') ?: '', 1);
                if ($domain === '' || (!checkdnsrr($domain, 'MX') && !checkdnsrr($domain, 'A'))) {
                    $skipped++;
                    $errors[] = [
                        'row' => $i + 1,
                        'email' => $email,
                        'error' => "Домен «{$domain}» не принимает почту (нет MX/A-записи). Проверьте правильность адреса.",
                    ];
                    continue;
                }

                $existing = DB::table('employee_invitations')
                    ->where('company_id', $companyId)
                    ->where('email', $email)
                    ->whereIn('status', ['pending', 'claimed'])
                    ->orderByDesc('created_at')
                    ->first();

                if ($existing && $existing->status === 'claimed') {
                    $skipped++;
                    $errors[] = ['row' => $i + 1, 'email' => $email, 'error' => 'Пользователь уже принял приглашение'];
                    continue;
                }

                $token = Str::random(48);
                $requestedRole = $invite['requested_role'] ?? 'employee';
                if (!in_array($requestedRole, ['employee', 'manager', 'hrd', 'company_admin'], true)) {
                    $requestedRole = 'employee';
                }
                $row = [
                    'company_id'      => $companyId,
                    'email'           => $email,
                    'full_name'       => trim((string) ($invite['full_name'] ?? '')) ?: null,
                    'position_id'     => $invite['position_id'] ?? null,
                    'department'      => trim((string) ($invite['department'] ?? '')) ?: null,
                    'requested_role'  => $requestedRole,
                    'status'          => 'pending',
                    'invited_by'      => method_exists($actor, 'domainUserId') ? $actor->domainUserId() : $actor->id,
                    'token'           => $token,
                    'token_hash'      => hash('sha256', $token),
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ];

                if ($existing && $existing->status === 'pending') {
                    $update = $row;
                    unset($update['company_id'], $update['email'], $update['status'], $update['invited_by'], $update['created_at']);

                    try {
                        DB::table('employee_invitations')->where('id', $existing->id)->update($update);
                        $row['id'] = $existing->id;
                        $row['created_at'] = $existing->created_at;
                        $updated++;
                        $pendingSends[] = ['row' => $row, 'token' => $token, 'index' => $i + 1];
                    } catch (Throwable $e) {
                        $skipped++;
                        $errors[] = ['row' => $i + 1, 'email' => $email, 'error' => self::localize($e->getMessage())];
                    }
                    continue;
                }

                if (Schema::hasColumn('employee_invitations', 'id') && !$this->idColumnIsInteger('employee_invitations')) {
                    $row['id'] = (string) Str::uuid();
                }

                try {
                    DB::table('employee_invitations')->insert($row);
                    $created++;
                    $pendingSends[] = ['row' => $row, 'token' => $token, 'index' => $i + 1];
                } catch (Throwable $e) {
                    $skipped++;
                    $errors[] = ['row' => $i + 1, 'email' => $email, 'error' => self::localize($e->getMessage())];
                }
            }
        });

        // Отправка писем после коммита. Ошибки почты не откатывают запись —
        // остаётся возможность «отправить повторно».
        $mailed = 0;
        $companyName = DB::table('companies')->where('id', $companyId)->value('name');
        $inviterName = $this->resolveActorName($actor);

        foreach ($pendingSends as $send) {
            $mailError = null;
            $ok = $this->sendInvitationMail($send['row'], $send['token'], $companyName, $inviterName, $mailError);
            if ($ok) {
                $mailed++;
            } else {
                $errors[] = [
                    'row'   => $send['index'],
                    'email' => $send['row']['email'],
                    'error' => 'Письмо не отправлено: ' . ($mailError ?: 'unknown'),
                ];
            }
        }

        return response()->json(['data' => [
            'created' => $created,
            'updated' => $updated,
            'mailed'  => $mailed,
            'skipped' => $skipped,
            'errors'  => $errors,
        ]]);
    }

    /** Повторная отправка приглашения (перегенерирует токен). */
    private function resendInvitation(Request $request, array $payload)
    {
        $actor = $request->user();
        if (!$actor) {
            return response()->json(['error' => 'Не авторизован'], 401);
        }
        if (!$actor->hasRole(['hrd', 'company_admin', 'superadmin', 'manager'])) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }

        $id = (string) ($payload['_invitation_id'] ?? $payload['invitation_id'] ?? '');
        if ($id === '') {
            return response()->json(['error' => 'Не указан идентификатор приглашения'], 422);
        }

        $inv = DB::table('employee_invitations')->where('id', $id)->first();
        if (!$inv) {
            return response()->json(['error' => 'Приглашение не найдено'], 404);
        }

        $actorCompanyId = method_exists($actor, 'companyId') ? $actor->companyId() : null;
        if (!$actor->hasRole('superadmin') && (string) $inv->company_id !== (string) $actorCompanyId) {
            return response()->json(['error' => 'Недостаточно прав'], 403);
        }
        if ($inv->status !== 'pending') {
            return response()->json(['error' => 'Приглашение уже обработано'], 422);
        }

        $token = Str::random(48);
        DB::table('employee_invitations')->where('id', $id)->update([
            'token'      => $token,
            'token_hash' => hash('sha256', $token),
            'updated_at' => now(),
        ]);

        $row = (array) $inv;
        $row['token'] = $token;

        $companyName = DB::table('companies')->where('id', $inv->company_id)->value('name');
        $inviterName = $this->resolveActorName($actor);
        $mailError = null;
        $ok = $this->sendInvitationMail($row, $token, $companyName, $inviterName, $mailError);

        return response()->json(['data' => [
            'mailed' => $ok ? 1 : 0,
            'error'  => $ok ? null : $mailError,
        ]]);
    }

    private function resolveActorName($actor): ?string
    {
        if (!$actor) return null;
        $domainId = method_exists($actor, 'domainUserId') ? $actor->domainUserId() : $actor->id;
        $prof = DB::table('profiles')->where('user_id', $domainId)->first();
        $name = trim((string) ($prof->full_name ?? ''));
        if ($name !== '') return $name;
        return $actor->email ?? null;
    }

    /**
     * Отправка письма-приглашения. Возвращает true при успехе,
     * иначе записывает причину в $error и false. Не бросает исключений.
     */
    private function sendInvitationMail(array $row, string $rawToken, ?string $companyName, ?string $inviterName, ?string &$error = null): bool
    {
        $error = null;
        $frontend = rtrim((string) (config('services.frontend.url')
            ?: env('FRONTEND_URL')
            ?: config('app.url')
            ?: ''), '/');
        if ($frontend === '') {
            $frontend = 'https://growth-peak.pro';
        }

        $url = $frontend . '/complete-registration?token=' . urlencode($rawToken)
            . '&email=' . urlencode((string) $row['email']);

        try {
            $mailable = new EmployeeInvited(
                recipientEmail: (string) $row['email'],
                inviteUrl: $url,
                recipientName: $row['full_name'] ?? null,
                companyName: $companyName ?: null,
                inviterName: $inviterName ?: null,
                positionTitle: !empty($row['position_id'])
                    ? DB::table('positions')->where('id', $row['position_id'])->value('title')
                    : null,
                department: $row['department'] ?? null,
            );
        } catch (Throwable $e) {
            $error = $e->getMessage();
            Log::error('Invitation mailable build failed', ['email' => $row['email'] ?? null, 'error' => $error]);
            return false;
        }

        $mailConfig = app(EmailConfigService::class);
        try {
            $mailConfig->autoRepairActiveSettings();
            $mailConfig->apply();
            Mail::to($row['email'])->send($mailable);
            Log::info('Invitation mail sent', ['email' => $row['email']]);
            return true;
        } catch (Throwable $e) {
            if (EmailConfigService::shouldFallbackToRuntimeEnv($e)) {
                try {
                    $mailConfig->applyRuntimeEnv();
                    Mail::to($row['email'])->send($mailable);
                    Log::info('Invitation mail sent via runtime env fallback', ['email' => $row['email']]);
                    return true;
                } catch (Throwable $retry) {
                    $error = $retry->getMessage();
                    Log::error('Invitation mail failed (runtime env retry)', ['email' => $row['email'], 'error' => $error]);
                    report($retry);
                    return false;
                }
            }
            $error = $e->getMessage();
            Log::error('Invitation mail failed', ['email' => $row['email'], 'error' => $error]);
            report($e);
            return false;
        }
    }


    private function verifyUser(object $profile)
    {
        DB::table('profiles')->where('id', $profile->id)->update(['is_verified' => true, 'updated_at' => now()]);
        return response()->json(['data' => true]);
    }

    private function rejectUser(object $profile)
    {
        DB::table('profiles')->where('id', $profile->id)->update(['is_verified' => false, 'updated_at' => now()]);
        return response()->json(['data' => true]);
    }

    private function assignRole($actor, object $profile, string $role)
    {
        $allowed = ['employee', 'manager', 'hrd', 'company_admin', 'superadmin'];
        if (!in_array($role, $allowed, true)) {
            return response()->json(['error' => 'Недопустимая роль'], 422);
        }
        if (!$actor?->hasRole('superadmin') && in_array($role, ['superadmin', 'company_admin'], true)) {
            return response()->json(['error' => 'Недостаточно прав для назначения этой роли'], 403);
        }

        $userId = (string) $profile->user_id;
        DB::transaction(function () use ($profile, $userId, $role) {
            DB::table('user_roles')->where('user_id', $userId)->delete();
            $row = ['user_id' => $userId, 'role' => $role];
            if (Schema::hasColumn('user_roles', 'id') && !$this->idColumnIsInteger('user_roles')) {
                $row['id'] = (string) Str::uuid();
            }
            if (Schema::hasColumn('user_roles', 'created_at')) $row['created_at'] = now();
            if (Schema::hasColumn('user_roles', 'updated_at')) $row['updated_at'] = now();
            DB::table('user_roles')->insert($row);
            DB::table('profiles')->where('id', $profile->id)->update(['requested_role' => $role, 'updated_at' => now()]);
        });

        return response()->json(['data' => true]);
    }

    private function deleteUser($actor, object $profile)
    {
        if ((string) $profile->user_id === (string) ($actor?->domainUserId() ?? $actor?->id)) {
            return response()->json(['error' => 'Нельзя удалить свою учетную запись'], 422);
        }

        $domainUserId = (string) $profile->user_id;
        $authUserId = $this->findAuthUserId($domainUserId, $profile);

        DB::transaction(function () use ($profile, $domainUserId, $authUserId) {
            if (Schema::hasTable('personal_access_tokens') && $authUserId !== null) {
                DB::table('personal_access_tokens')->where('tokenable_id', (string) $authUserId)->delete();
            }
            DB::table('user_roles')->where('user_id', $domainUserId)->delete();
            DB::table('profiles')->where('id', $profile->id)->delete();
            if ($authUserId !== null) {
                DB::table('users')->where('id', $authUserId)->delete();
            }
        });

        return response()->json(['data' => true]);
    }

    private function findProfileByDomainId(string $id): ?object
    {
        $query = DB::table('profiles');
        $hasCondition = false;

        if ($this->canCompareColumnValue('profiles', 'user_id', $id)) {
            $query->where('user_id', $id);
            $hasCondition = true;
        }
        if ($this->canCompareColumnValue('profiles', 'id', $id)) {
            $hasCondition ? $query->orWhere('id', $id) : $query->where('id', $id);
            $hasCondition = true;
        }

        return $hasCondition ? $query->first() : null;
    }

    private function findAuthUserId(string $domainUserId, object $profile): mixed
    {
        if ($this->canCompareColumnValue('users', 'id', $domainUserId)) {
            $id = DB::table('users')->where('id', $domainUserId)->value('id');
            if ($id !== null) return $id;
        }

        if (Schema::hasColumn('users', 'meta')) {
            $compact = '%"sub":"' . addcslashes($domainUserId, '%_\\') . '"%';
            $spaced = '%"sub": "' . addcslashes($domainUserId, '%_\\') . '"%';
            $id = DB::table('users')->where('meta', 'like', $compact)->orWhere('meta', 'like', $spaced)->value('id');
            if ($id !== null) return $id;
        }

        return null;
    }

    private function canManageTarget($actor, object $profile): bool
    {
        if (!$actor) return false;
        if ($actor->hasRole('superadmin')) return true;
        if (!$actor->hasRole(['company_admin', 'hrd'])) return false;
        return (string) $actor->companyId() !== '' && (string) $actor->companyId() === (string) ($profile->company_id ?? '');
    }

    private function canCompareColumnValue(string $table, string $column, mixed $value): bool
    {
        if ($value === null || $value === '') return false;
        if (DB::getDriverName() !== 'mysql') return true;
        try {
            $meta = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]);
            $type = strtolower((string) ($meta->Type ?? ''));
            $isNumeric = str_contains($type, 'int') || str_contains($type, 'decimal') || str_contains($type, 'float') || str_contains($type, 'double');
            return !$isNumeric || is_numeric($value);
        } catch (Throwable) {
            return true;
        }
    }

    private function idColumnIsInteger(string $table): bool
    {
        if (DB::getDriverName() !== 'mysql') return false;
        try {
            $column = DB::selectOne("SHOW COLUMNS FROM `{$table}` LIKE 'id'");
            return $column && str_contains(strtolower((string) $column->Type), 'int');
        } catch (Throwable) {
            return false;
        }
    }

    /** Public landing form: create a demo request row. */
    private function submitDemoRequest(array $payload)
    {
        $name = trim((string) ($payload['_name'] ?? $payload['name'] ?? ''));
        $email = trim((string) ($payload['_email'] ?? $payload['email'] ?? ''));
        $company = trim((string) ($payload['_company'] ?? $payload['company'] ?? ''));
        $headcountRaw = $payload['_headcount'] ?? $payload['headcount'] ?? null;
        $source = trim((string) ($payload['_source'] ?? $payload['source'] ?? '')) ?: 'landing';

        if ($name === '') {
            return response()->json(['error' => 'Укажите имя'], 422);
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json(['error' => 'Укажите корректный email'], 422);
        }

        try {
            $row = \App\Models\DemoRequest::create([
                'name'      => $name,
                'email'     => $email,
                'company'   => $company !== '' ? $company : null,
                'headcount' => $headcountRaw !== null && $headcountRaw !== '' ? (int) $headcountRaw : null,
                'source'    => $source,
                'status'    => 'new',
            ]);
            $this->notifySales(fn () => new DemoRequestSubmitted($row));
            return response()->json(['data' => ['id' => $row->id]]);
        } catch (Throwable $e) {
            report($e);
            return response()->json(['error' => self::localize($e->getMessage())], 422);
        }
    }

    /** Send a sales notification email; never let mail failures break the API response. */
    private function notifySales(\Closure $mailableFactory): void
    {
        $recipient = config('mail.sales_recipient');
        if (! $recipient) {
            \Illuminate\Support\Facades\Log::warning('Sales notification skipped: no recipient configured (mail.sales_recipient)');
            return;
        }

        $mailable = null;
        try {
            $mailable = $mailableFactory();
        } catch (Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Sales notification mailable build failed', [
                'to' => $recipient,
                'error' => $e->getMessage(),
            ]);
            report($e);
            return;
        }

        $subject = method_exists($mailable, 'envelope')
            ? (string) ($mailable->envelope()->subject ?? '')
            : '';

        $mailConfig = app(\App\Services\EmailConfigService::class);

        try {
            $mailConfig->autoRepairActiveSettings();
            $mailConfig->apply();
            Mail::to($recipient)->send($mailable);
            \Illuminate\Support\Facades\Log::info('Sales notification sent', [
                'to' => $recipient,
                'subject' => $subject,
            ]);
            return;
        } catch (Throwable $e) {
            if (\App\Services\EmailConfigService::shouldFallbackToRuntimeEnv($e)) {
                \Illuminate\Support\Facades\Log::warning('Sales notification stored SMTP failed, retrying with runtime env', [
                    'to' => $recipient,
                    'subject' => $subject,
                    'error' => $e->getMessage(),
                ]);
                try {
                    $mailConfig->applyRuntimeEnv();
                    Mail::to($recipient)->send($mailable);
                    \Illuminate\Support\Facades\Log::info('Sales notification sent via runtime env fallback', [
                        'to' => $recipient,
                        'subject' => $subject,
                    ]);
                    return;
                } catch (Throwable $retry) {
                    \Illuminate\Support\Facades\Log::error('Sales notification failed (runtime env retry)', [
                        'to' => $recipient,
                        'subject' => $subject,
                        'error' => $retry->getMessage(),
                    ]);
                    report($retry);
                    return;
                }
            }

            \Illuminate\Support\Facades\Log::error('Sales notification failed', [
                'to' => $recipient,
                'subject' => $subject,
                'error' => $e->getMessage(),
            ]);
            report($e);
        }
    }

    /** Public pricing page form: create a pricing inquiry row. */
    private function submitPricingInquiry(array $payload)
    {
        $name = trim((string) ($payload['_name'] ?? $payload['name'] ?? ''));
        $email = trim((string) ($payload['_email'] ?? $payload['email'] ?? ''));
        $plan = trim((string) ($payload['_plan'] ?? $payload['plan'] ?? ''));
        $company = trim((string) ($payload['_company'] ?? $payload['company'] ?? ''));
        $phone = trim((string) ($payload['_phone'] ?? $payload['phone'] ?? ''));
        $message = trim((string) ($payload['_message'] ?? $payload['message'] ?? ''));
        $headcountRaw = $payload['_headcount'] ?? $payload['headcount'] ?? null;
        $source = trim((string) ($payload['_source'] ?? $payload['source'] ?? '')) ?: 'pricing_page';

        if ($name === '') {
            return response()->json(['error' => 'Укажите имя'], 422);
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json(['error' => 'Укажите корректный email'], 422);
        }
        if ($plan === '') {
            return response()->json(['error' => 'Укажите тариф'], 422);
        }

        try {
            $row = \App\Models\PricingInquiry::create([
                'name'      => $name,
                'email'     => $email,
                'plan'      => $plan,
                'company'   => $company !== '' ? $company : null,
                'phone'     => $phone !== '' ? $phone : null,
                'message'   => $message !== '' ? $message : null,
                'headcount' => $headcountRaw !== null && $headcountRaw !== '' ? (int) $headcountRaw : null,
                'source'    => $source,
                'status'    => 'new',
            ]);
            $this->notifySales(fn () => new PricingInquirySubmitted($row));
            return response()->json(['data' => ['id' => $row->id]]);
        } catch (Throwable $e) {
            report($e);
            return response()->json(['error' => self::localize($e->getMessage())], 422);
        }
    }

    /** Map common Postgres errors to Russian per project memory. */

    protected static function localize(string $raw): string
    {
        if (preg_match('/violates row-level security/i', $raw)) {
            return 'Недостаточно прав для этой операции';
        }
        if (preg_match('/duplicate key value/i', $raw)) {
            return 'Запись с такими данными уже существует';
        }
        if (preg_match('/foreign key constraint/i', $raw)) {
            return 'Связанная запись не найдена';
        }
        // Postgres `RAISE EXCEPTION 'msg'` arrives as: SQLSTATE[P0001]: ... ERROR:  msg  CONTEXT: ...
        if (preg_match('/ERROR:\s*([^\n]+?)(?:\s+CONTEXT:|$)/u', $raw, $m)) {
            return trim($m[1]);
        }
        return 'Ошибка выполнения операции';
    }
}
