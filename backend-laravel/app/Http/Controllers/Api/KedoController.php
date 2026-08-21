<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Epic B2 — КЭДО: шаблоны, маршруты, документы, подписание (ПЭП/УКЭП),
 * hash chain журнал и каркас ГИС ЭДО.
 *
 * Все выборки — raw DB::table (без Eloquent-гидрации), списки без body_html.
 */
class KedoController extends Controller
{
    private const LIST_LIMIT = 300;

    // ======================= Templates =======================

    public function indexTemplates(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $this->ensureSystemTemplates($companyId, $request);

        $rows = DB::table('kedo_templates')
            ->select('id', 'company_id', 'code', 'title', 'category', 'requires_signature',
                     'signature_kind', 'route_id', 'retention_years', 'is_system', 'is_active', 'updated_at')
            ->where(function ($q) use ($companyId) {
                $q->where('company_id', $companyId)->orWhereNull('company_id');
            })
            ->orderBy('category')->orderBy('title')
            ->limit(500)
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function showTemplate(string $id, Request $request): JsonResponse
    {
        $row = DB::table('kedo_templates')->where('id', $id)->first();
        if (!$row) abort(404);
        $this->assertTemplateVisible($row, $request);
        return response()->json($row);
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'title'              => 'required|string|max:250',
            'code'               => 'nullable|string|max:64',
            'category'           => 'nullable|string|max:64',
            'body_html'          => 'nullable|string',
            'requires_signature' => 'sometimes|boolean',
            'signature_kind'     => 'sometimes|in:pep,ukep,any',
            'route_id'           => 'nullable|uuid',
            'retention_years'    => 'sometimes|integer|min:1|max:100',
        ]);
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $id = (string) Str::uuid();
        DB::table('kedo_templates')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'code' => $data['code'] ?? ('custom_' . substr($id, 0, 8)),
            'title' => $data['title'],
            'category' => $data['category'] ?? 'other',
            'body_html' => $data['body_html'] ?? '',
            'placeholders' => json_encode($this->extractPlaceholders($data['body_html'] ?? ''), JSON_UNESCAPED_UNICODE),
            'requires_signature' => (bool) ($data['requires_signature'] ?? true),
            'signature_kind' => $data['signature_kind'] ?? 'pep',
            'route_id' => $data['route_id'] ?? null,
            'retention_years' => $data['retention_years'] ?? 75,
            'is_system' => false,
            'is_active' => true,
            'created_by' => $this->userId($request),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(DB::table('kedo_templates')->where('id', $id)->first(), 201);
    }

    public function updateTemplate(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $row = DB::table('kedo_templates')->where('id', $id)->first();
        if (!$row) abort(404);
        $companyId = $this->companyId($request);

        $data = $request->validate([
            'title'              => 'sometimes|string|max:250',
            'category'           => 'sometimes|string|max:64',
            'body_html'          => 'sometimes|nullable|string',
            'requires_signature' => 'sometimes|boolean',
            'signature_kind'     => 'sometimes|in:pep,ukep,any',
            'route_id'           => 'sometimes|nullable|uuid',
            'retention_years'    => 'sometimes|integer|min:1|max:100',
            'is_active'          => 'sometimes|boolean',
        ]);

        // Системный шаблон не редактируем — делаем копию компании.
        if ($row->company_id === null || (int) $row->is_system === 1) {
            $newId = (string) Str::uuid();
            DB::table('kedo_templates')->insert([
                'id' => $newId,
                'company_id' => $companyId,
                'code' => $row->code,
                'title' => $data['title'] ?? $row->title,
                'category' => $data['category'] ?? $row->category,
                'body_html' => $data['body_html'] ?? $row->body_html,
                'placeholders' => json_encode($this->extractPlaceholders($data['body_html'] ?? (string) $row->body_html), JSON_UNESCAPED_UNICODE),
                'requires_signature' => (bool) ($data['requires_signature'] ?? $row->requires_signature),
                'signature_kind' => $data['signature_kind'] ?? $row->signature_kind,
                'route_id' => $data['route_id'] ?? $row->route_id,
                'retention_years' => $data['retention_years'] ?? $row->retention_years,
                'is_system' => false,
                'is_active' => (bool) ($data['is_active'] ?? true),
                'created_by' => $this->userId($request),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            return response()->json(DB::table('kedo_templates')->where('id', $newId)->first());
        }

        if ($row->company_id !== $companyId) abort(403);

        $payload = array_intersect_key($data, array_flip([
            'title', 'category', 'body_html', 'requires_signature', 'signature_kind', 'route_id', 'retention_years', 'is_active',
        ]));
        if (array_key_exists('body_html', $payload)) {
            $payload['placeholders'] = json_encode($this->extractPlaceholders((string) $payload['body_html']), JSON_UNESCAPED_UNICODE);
        }
        if ($payload) {
            $payload['updated_at'] = now();
            DB::table('kedo_templates')->where('id', $id)->update($payload);
        }
        return response()->json(DB::table('kedo_templates')->where('id', $id)->first());
    }

    public function destroyTemplate(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        DB::table('kedo_templates')
            ->where('id', $id)
            ->where('company_id', $this->companyId($request))
            ->where('is_system', false)
            ->delete();
        return response()->json(['ok' => true]);
    }

    // ======================= Routes =======================

    public function indexRoutes(Request $request): JsonResponse
    {
        $companyId = $this->companyId($request);
        $routes = DB::table('kedo_routes')
            ->where('company_id', $companyId)
            ->orderBy('title')->limit(200)->get();

        $steps = DB::table('kedo_route_steps')
            ->where('company_id', $companyId)
            ->orderBy('step_order')->limit(2000)->get()
            ->groupBy('route_id');

        $data = $routes->map(function ($r) use ($steps) {
            $r->steps = array_values(($steps[$r->id] ?? collect())->all());
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function storeRoute(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $this->validateRoute($request);
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $id = (string) Str::uuid();
        DB::table('kedo_routes')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'is_active' => true,
            'created_by' => $this->userId($request),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->replaceSteps($id, $companyId, $data['steps'] ?? []);

        return response()->json(['ok' => true, 'id' => $id], 201);
    }

    public function updateRoute(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $route = DB::table('kedo_routes')->where('id', $id)->where('company_id', $companyId)->first();
        if (!$route) abort(404);

        $data = $this->validateRoute($request, false);
        $payload = array_intersect_key($data, array_flip(['title', 'description', 'is_active']));
        if ($payload) {
            $payload['updated_at'] = now();
            DB::table('kedo_routes')->where('id', $id)->update($payload);
        }
        if (array_key_exists('steps', $data)) {
            $this->replaceSteps($id, $companyId, $data['steps'] ?? []);
        }
        return response()->json(['ok' => true]);
    }

    public function destroyRoute(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        DB::table('kedo_route_steps')->where('route_id', $id)->where('company_id', $companyId)->delete();
        DB::table('kedo_routes')->where('id', $id)->where('company_id', $companyId)->delete();
        return response()->json(['ok' => true]);
    }

    // ======================= Documents =======================

    public function indexDocuments(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);

        $q = DB::table('kedo_documents')
            ->select('id', 'company_id', 'template_id', 'route_id', 'user_id', 'number', 'title',
                     'category', 'status', 'current_step', 'signature_kind', 'retention_until',
                     'created_at', 'completed_at')
            ->where('company_id', $companyId);

        if ($status = $request->query('status')) $q->where('status', (string) $status);
        if ($userId = $request->query('user_id')) $q->where('user_id', (string) $userId);
        if ($search = $request->query('search')) $q->where('title', 'like', '%' . $search . '%');

        $rows = $q->orderByDesc('created_at')->limit(self::LIST_LIMIT)->get();

        $names = $this->namesFor($rows->pluck('user_id')->all());
        $data = $rows->map(function ($r) use ($names) {
            $r->employee_name = $names[$r->user_id] ?? null;
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function myDocuments(Request $request): JsonResponse
    {
        $userId = $this->userId($request);
        $companyId = $this->companyId($request);

        $participantDocs = DB::table('kedo_document_participants')
            ->where('user_id', $userId)->limit(1000)->pluck('document_id')->all();

        $rows = DB::table('kedo_documents')
            ->select('id', 'title', 'category', 'status', 'current_step', 'signature_kind',
                     'user_id', 'created_at', 'completed_at')
            ->where('company_id', $companyId)
            ->where(function ($q) use ($userId, $participantDocs) {
                $q->where('user_id', $userId);
                if ($participantDocs) $q->orWhereIn('id', $participantDocs);
            })
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        $tasks = DB::table('kedo_document_participants')
            ->where('user_id', $userId)->where('status', 'pending')
            ->limit(500)->get()->keyBy('document_id');

        $data = $rows->map(function ($r) use ($tasks) {
            $t = $tasks[$r->id] ?? null;
            $r->my_action = $t->action ?? null;
            $r->my_step = $t->step_order ?? null;
            $r->action_required = $t && (int) $t->step_order === (int) $r->current_step && $r->status === 'in_review';
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function showDocument(string $id, Request $request): JsonResponse
    {
        $doc = DB::table('kedo_documents')->where('id', $id)->first();
        if (!$doc) abort(404);
        $this->assertDocAccess($doc, $request);

        $participants = DB::table('kedo_document_participants')
            ->where('document_id', $id)->orderBy('step_order')->limit(200)->get();
        $names = $this->namesFor(array_merge($participants->pluck('user_id')->all(), [$doc->user_id]));
        $participants = $participants->map(function ($p) use ($names) {
            $p->name = $names[$p->user_id] ?? null;
            return $p;
        })->values();

        $signatures = DB::table('kedo_signatures')
            ->select('id', 'user_id', 'kind', 'cert_subject', 'cert_serial', 'provider', 'ip', 'doc_hash', 'signed_at')
            ->where('document_id', $id)->whereNotNull('signed_at')
            ->orderBy('signed_at')->limit(100)->get()
            ->map(function ($s) use ($names) {
                $s->name = $names[$s->user_id] ?? null;
                return $s;
            })->values();

        $doc->employee_name = $names[$doc->user_id] ?? null;
        $myTask = DB::table('kedo_document_participants')
            ->where('document_id', $id)->where('user_id', $this->userId($request))
            ->where('status', 'pending')->first();

        return response()->json([
            'document' => $doc,
            'participants' => $participants,
            'signatures' => $signatures,
            'my_task' => $myTask,
        ]);
    }

    /** Массовое создание документов по цели: сотрудники / отдел / подразделение / должность / компания. */
    public function bulkCreate(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'template_id' => 'required|uuid',
            'scope_type'  => 'required|in:user,department,position,company',
            'user_ids'    => 'array',
            'user_ids.*'  => 'uuid',
            'scope_ref'   => 'nullable|string|max:200',
            'route_id'    => 'nullable|uuid',
            'send'        => 'sometimes|boolean',
        ]);

        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }

        $tpl = DB::table('kedo_templates')->where('id', $data['template_id'])->first();
        if (!$tpl) abort(404);
        $this->assertTemplateVisible($tpl, $request);

        $targets = $this->resolveTargets($companyId, $data);
        if (!$targets) {
            return response()->json(['ok' => false, 'message' => 'Не найдено ни одного получателя.'], 422);
        }

        $routeId = $data['route_id'] ?? $tpl->route_id;
        $steps = $routeId
            ? DB::table('kedo_route_steps')->where('route_id', $routeId)->orderBy('step_order')->limit(50)->get()
            : collect();

        $created = 0;
        foreach (array_chunk($targets, 50) as $chunk) {
            foreach ($chunk as $profile) {
                $docId = (string) Str::uuid();
                $body = $this->renderBody((string) $tpl->body_html, $profile);
                $hash = hash('sha256', $body);

                DB::table('kedo_documents')->insert([
                    'id' => $docId,
                    'company_id' => $companyId,
                    'template_id' => $tpl->id,
                    'route_id' => $routeId,
                    'user_id' => $profile->user_id,
                    'number' => strtoupper(substr($docId, 0, 8)),
                    'title' => $tpl->title,
                    'category' => $tpl->category,
                    'body_html' => $body,
                    'status' => ($data['send'] ?? true) ? 'in_review' : 'draft',
                    'current_step' => 1,
                    'signature_kind' => $tpl->signature_kind,
                    'retention_until' => now()->addYears((int) ($tpl->retention_years ?: 75))->toDateString(),
                    'doc_hash' => $hash,
                    'sent_at' => ($data['send'] ?? true) ? now() : null,
                    'created_by' => $this->userId($request),
                    'created_at' => now(), 'updated_at' => now(),
                ]);

                $this->materializeParticipants($docId, $companyId, $profile->user_id, $steps, $tpl);
                $this->appendEvent($companyId, $docId, $this->userId($request), 'created', [
                    'template' => $tpl->code, 'hash' => $hash,
                ]);
                if ($data['send'] ?? true) {
                    $this->appendEvent($companyId, $docId, $this->userId($request), 'sent', []);
                }
                $created++;
            }
        }

        return response()->json(['ok' => true, 'created' => $created], 201);
    }

    public function sendDocument(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $doc = DB::table('kedo_documents')->where('id', $id)->where('company_id', $companyId)->first();
        if (!$doc) abort(404);
        if ($doc->status !== 'draft') {
            return response()->json(['ok' => false, 'message' => 'Документ уже отправлен.'], 422);
        }
        DB::table('kedo_documents')->where('id', $id)->update([
            'status' => 'in_review', 'sent_at' => now(), 'updated_at' => now(),
        ]);
        $this->appendEvent($companyId, $id, $this->userId($request), 'sent', []);
        return response()->json(['ok' => true]);
    }

    public function cancelDocument(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $doc = DB::table('kedo_documents')->where('id', $id)->where('company_id', $companyId)->first();
        if (!$doc) abort(404);
        if ($doc->status === 'signed') {
            return response()->json(['ok' => false, 'message' => 'Подписанный документ нельзя аннулировать удалением — он хранится до ' . $doc->retention_until . '.'], 422);
        }
        DB::table('kedo_documents')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        $this->appendEvent($companyId, $id, $this->userId($request), 'cancelled', [
            'reason' => (string) $request->input('reason', ''),
        ]);
        return response()->json(['ok' => true]);
    }

    // ======================= Actions & signing =======================

    public function requestOtp(string $id, Request $request): JsonResponse
    {
        [$doc, $task] = $this->taskFor($id, $request);
        $code = (string) random_int(100000, 999999);

        DB::table('kedo_signatures')->where('document_id', $id)
            ->where('user_id', $this->userId($request))->whereNull('signed_at')->delete();

        DB::table('kedo_signatures')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $doc->company_id,
            'document_id' => $id,
            'user_id' => $this->userId($request),
            'kind' => 'pep',
            'otp_hash' => hash('sha256', $code),
            'otp_expires_at' => now()->addMinutes(10),
            'doc_hash' => $doc->doc_hash,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->appendEvent($doc->company_id, $id, $this->userId($request), 'otp_requested', []);

        // Почтовая доставка кода — best effort, код также возвращается владельцу подписи.
        try {
            $email = DB::table('users')->where('id', $this->userId($request))->value('email');
            if ($email) {
                \Illuminate\Support\Facades\Mail::raw(
                    "Код подписания документа «{$doc->title}»: {$code}\nКод действует 10 минут.",
                    fn ($m) => $m->to($email)->subject('Код подписания документа')
                );
            }
        } catch (\Throwable) {
            // не блокируем подписание при недоступной почте
        }

        return response()->json(['ok' => true, 'code' => $code, 'expires_in' => 600]);
    }

    public function signPep(string $id, Request $request): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:12']);
        [$doc, $task] = $this->taskFor($id, $request);

        $sig = DB::table('kedo_signatures')->where('document_id', $id)
            ->where('user_id', $this->userId($request))->whereNull('signed_at')
            ->orderByDesc('created_at')->first();

        if (!$sig || !$sig->otp_hash) {
            return response()->json(['ok' => false, 'message' => 'Сначала запросите код подписания.'], 422);
        }
        if ($sig->otp_expires_at && strtotime((string) $sig->otp_expires_at) < time()) {
            return response()->json(['ok' => false, 'message' => 'Код истёк, запросите новый.'], 422);
        }
        if (!hash_equals((string) $sig->otp_hash, hash('sha256', trim($data['code'])))) {
            return response()->json(['ok' => false, 'message' => 'Неверный код подписания.'], 422);
        }

        DB::table('kedo_signatures')->where('id', $sig->id)->update([
            'signed_at' => now(),
            'otp_hash' => null,
            'ip' => substr((string) $request->ip(), 0, 64),
            'user_agent' => substr((string) $request->userAgent(), 0, 400),
            'doc_hash' => $doc->doc_hash,
            'updated_at' => now(),
        ]);

        $this->completeTask($doc, $task, 'signed_pep', ['signature_id' => $sig->id], $request);
        return response()->json(['ok' => true]);
    }

    public function signUkep(string $id, Request $request): JsonResponse
    {
        $data = $request->validate([
            'signature'    => 'required|file|max:5120',
            'cert_subject' => 'nullable|string|max:400',
            'cert_serial'  => 'nullable|string|max:128',
            'cert_valid_to'=> 'nullable|string|max:64',
            'provider'     => 'nullable|string|max:64',
        ]);
        [$doc, $task] = $this->taskFor($id, $request);

        $path = $request->file('signature')->store('kedo/signatures', 'public');

        DB::table('kedo_signatures')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $doc->company_id,
            'document_id' => $id,
            'user_id' => $this->userId($request),
            'kind' => 'ukep',
            'cert_subject' => $data['cert_subject'] ?? null,
            'cert_serial' => $data['cert_serial'] ?? null,
            'cert_valid_to' => $data['cert_valid_to'] ?? null,
            'provider' => $data['provider'] ?? 'manual',
            'sig_path' => $path,
            'ip' => substr((string) $request->ip(), 0, 64),
            'user_agent' => substr((string) $request->userAgent(), 0, 400),
            'doc_hash' => $doc->doc_hash,
            'signed_at' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->completeTask($doc, $task, 'signed_ukep', ['cert' => $data['cert_serial'] ?? null], $request);
        return response()->json(['ok' => true]);
    }

    public function approve(string $id, Request $request): JsonResponse
    {
        [$doc, $task] = $this->taskFor($id, $request);
        $this->completeTask($doc, $task, 'approved', ['comment' => (string) $request->input('comment', '')], $request);
        return response()->json(['ok' => true]);
    }

    public function acknowledge(string $id, Request $request): JsonResponse
    {
        [$doc, $task] = $this->taskFor($id, $request);
        $this->completeTask($doc, $task, 'acknowledged', [], $request);
        return response()->json(['ok' => true]);
    }

    public function reject(string $id, Request $request): JsonResponse
    {
        $data = $request->validate(['reason' => 'required|string|max:1000']);
        [$doc, $task] = $this->taskFor($id, $request);

        DB::table('kedo_document_participants')->where('id', $task->id)->update([
            'status' => 'rejected', 'acted_at' => now(),
            'comment' => $data['reason'], 'updated_at' => now(),
        ]);
        DB::table('kedo_documents')->where('id', $doc->id)->update([
            'status' => 'rejected', 'updated_at' => now(),
        ]);
        $this->appendEvent($doc->company_id, $doc->id, $this->userId($request), 'rejected', ['reason' => $data['reason']]);
        return response()->json(['ok' => true]);
    }

    // ======================= Journal / hash chain =======================

    public function events(string $id, Request $request): JsonResponse
    {
        $doc = DB::table('kedo_documents')->where('id', $id)->first();
        if (!$doc) abort(404);
        $this->assertDocAccess($doc, $request);

        $rows = DB::table('kedo_events')->where('document_id', $id)
            ->orderBy('created_at')->orderBy('id')->limit(500)->get();
        $names = $this->namesFor($rows->pluck('actor_id')->filter()->all());
        $data = $rows->map(function ($r) use ($names) {
            $r->actor_name = $names[$r->actor_id] ?? null;
            return $r;
        })->values();

        return response()->json(['data' => $data]);
    }

    public function verifyChain(string $id, Request $request): JsonResponse
    {
        $doc = DB::table('kedo_documents')->where('id', $id)->first();
        if (!$doc) abort(404);
        $this->assertDocAccess($doc, $request);

        $rows = DB::table('kedo_events')->where('document_id', $id)
            ->orderBy('chain_index')->orderBy('created_at')->orderBy('id')->limit(1000)->get();

        $prev = null;
        $broken = null;
        foreach ($rows as $e) {
            $expected = $this->chainHash($prev, $id, $e->event, (string) $e->payload, (string) $e->created_at);
            if ($e->prev_hash !== $prev || !hash_equals((string) $e->hash, $expected)) {
                $broken = $e->id;
                break;
            }
            $prev = $e->hash;
        }

        return response()->json([
            'ok' => $broken === null,
            'events' => $rows->count(),
            'broken_event_id' => $broken,
            'head_hash' => $prev,
            'retention_until' => $doc->retention_until,
        ]);
    }

    // ======================= ГИС ЭДО (каркас) =======================

    public function indexEdoConnections(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $rows = DB::table('kedo_edo_connections')
            ->select('id', 'provider', 'title', 'endpoint', 'login', 'is_active', 'last_check_at', 'last_status')
            ->where('company_id', $this->companyId($request))
            ->orderBy('title')->limit(50)->get();
        return response()->json(['data' => $rows]);
    }

    public function storeEdoConnection(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'provider' => 'required|in:sfr,fns,diadoc,nobel',
            'title'    => 'required|string|max:200',
            'endpoint' => 'nullable|string|max:400',
            'login'    => 'nullable|string|max:200',
            'secret'   => 'nullable|string|max:500',
        ]);
        $companyId = $this->companyId($request);
        if (!$companyId) {
            return response()->json(['ok' => false, 'message' => 'Не указана компания.'], 422);
        }
        $id = (string) Str::uuid();
        DB::table('kedo_edo_connections')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'provider' => $data['provider'],
            'title' => $data['title'],
            'endpoint' => $data['endpoint'] ?? null,
            'login' => $data['login'] ?? null,
            'secret' => isset($data['secret']) ? encrypt($data['secret']) : null,
            'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['ok' => true, 'id' => $id], 201);
    }

    public function destroyEdoConnection(string $id, Request $request): JsonResponse
    {
        $this->assertHr($request);
        DB::table('kedo_edo_connections')->where('id', $id)
            ->where('company_id', $this->companyId($request))->delete();
        return response()->json(['ok' => true]);
    }

    public function dispatchToEdo(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $data = $request->validate([
            'connection_id' => 'required|uuid',
            'document_ids'  => 'required|array|min:1',
            'document_ids.*'=> 'uuid',
        ]);
        $companyId = $this->companyId($request);
        $conn = DB::table('kedo_edo_connections')->where('id', $data['connection_id'])
            ->where('company_id', $companyId)->first();
        if (!$conn) abort(404);

        $queued = 0;
        foreach (array_slice($data['document_ids'], 0, 200) as $docId) {
            $doc = DB::table('kedo_documents')->select('id', 'status')
                ->where('id', $docId)->where('company_id', $companyId)->first();
            if (!$doc) continue;
            DB::table('kedo_edo_dispatches')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'connection_id' => $conn->id,
                'document_id' => $doc->id,
                'status' => $doc->status === 'signed' ? 'queued' : 'failed',
                'message' => $doc->status === 'signed'
                    ? 'Поставлен в очередь на отправку в ' . strtoupper($conn->provider)
                    : 'Документ не подписан — отправка невозможна',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($doc->status === 'signed') {
                $this->appendEvent($companyId, $doc->id, $this->userId($request), 'edo_queued', ['provider' => $conn->provider]);
                $queued++;
            }
        }

        return response()->json(['ok' => true, 'queued' => $queued]);
    }

    public function indexDispatches(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $rows = DB::table('kedo_edo_dispatches as d')
            ->leftJoin('kedo_documents as doc', 'doc.id', '=', 'd.document_id')
            ->select('d.id', 'd.status', 'd.message', 'd.created_at', 'd.sent_at', 'doc.title')
            ->where('d.company_id', $this->companyId($request))
            ->orderByDesc('d.created_at')->limit(200)->get();
        return response()->json(['data' => $rows]);
    }

    // ======================= Stats =======================

    public function stats(Request $request): JsonResponse
    {
        $this->assertHr($request);
        $companyId = $this->companyId($request);
        $rows = DB::table('kedo_documents')
            ->select('status', DB::raw('count(*) as c'))
            ->where('company_id', $companyId)->groupBy('status')->get();

        $byStatus = [];
        foreach ($rows as $r) $byStatus[$r->status] = (int) $r->c;

        return response()->json([
            'by_status' => $byStatus,
            'total' => array_sum($byStatus),
            'templates' => (int) DB::table('kedo_templates')
                ->where(function ($q) use ($companyId) { $q->where('company_id', $companyId)->orWhereNull('company_id'); })
                ->count(),
            'routes' => (int) DB::table('kedo_routes')->where('company_id', $companyId)->count(),
        ]);
    }

    // ======================= Helpers =======================

    private function validateRoute(Request $request, bool $required = true): array
    {
        return $request->validate([
            'title'                 => ($required ? 'required' : 'sometimes') . '|string|max:200',
            'description'           => 'sometimes|nullable|string|max:1000',
            'is_active'             => 'sometimes|boolean',
            'steps'                 => 'sometimes|array|max:20',
            'steps.*.title'         => 'nullable|string|max:200',
            'steps.*.actor_type'    => 'required_with:steps|in:user,role,manager,subject',
            'steps.*.actor_ref'     => 'nullable|string|max:128',
            'steps.*.action'        => 'required_with:steps|in:approve,sign,acknowledge',
            'steps.*.due_days'      => 'nullable|integer|min:0|max:365',
        ]);
    }

    private function replaceSteps(string $routeId, ?string $companyId, array $steps): void
    {
        DB::table('kedo_route_steps')->where('route_id', $routeId)->delete();
        $order = 1;
        $rows = [];
        foreach ($steps as $s) {
            $rows[] = [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'route_id' => $routeId,
                'step_order' => $order++,
                'title' => $s['title'] ?? null,
                'actor_type' => $s['actor_type'] ?? 'user',
                'actor_ref' => $s['actor_ref'] ?? null,
                'action' => $s['action'] ?? 'sign',
                'due_days' => (int) ($s['due_days'] ?? 3),
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        if ($rows) DB::table('kedo_route_steps')->insert($rows);
    }

    /** @return array<int, object> профили получателей */
    private function resolveTargets(string $companyId, array $data): array
    {
        $q = DB::table('profiles')
            ->select('user_id', 'full_name', 'position', 'department', 'hire_date')
            ->where('company_id', $companyId);

        switch ($data['scope_type']) {
            case 'user':
                $ids = $data['user_ids'] ?? [];
                if (!$ids) return [];
                $q->whereIn('user_id', array_slice($ids, 0, 500));
                break;
            case 'department':
                $q->where('department', (string) ($data['scope_ref'] ?? ''));
                break;
            case 'position':
                if (Schema::hasColumn('profiles', 'position_id')) {
                    $q->where('position_id', (string) ($data['scope_ref'] ?? ''));
                } else {
                    $q->where('position', (string) ($data['scope_ref'] ?? ''));
                }
                break;
            case 'company':
            default:
                break;
        }

        return $q->limit(1000)->get()->all();
    }

    private function materializeParticipants(string $docId, string $companyId, string $subjectId, $steps, $tpl): void
    {
        $rows = [];
        if ($steps && count($steps)) {
            foreach ($steps as $s) {
                foreach ($this->resolveActors($companyId, $subjectId, $s) as $uid) {
                    $rows[] = [
                        'id' => (string) Str::uuid(),
                        'company_id' => $companyId,
                        'document_id' => $docId,
                        'user_id' => $uid,
                        'step_order' => (int) $s->step_order,
                        'action' => $s->action,
                        'status' => 'pending',
                        'due_date' => now()->addDays((int) $s->due_days)->toDateString(),
                        'created_at' => now(), 'updated_at' => now(),
                    ];
                }
            }
        }

        if (!$rows) {
            // Без маршрута — документ подписывает сам сотрудник.
            $rows[] = [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'document_id' => $docId,
                'user_id' => $subjectId,
                'step_order' => 1,
                'action' => ((int) ($tpl->requires_signature ?? 1)) ? 'sign' : 'acknowledge',
                'status' => 'pending',
                'due_date' => now()->addDays(3)->toDateString(),
                'created_at' => now(), 'updated_at' => now(),
            ];
        }

        DB::table('kedo_document_participants')->insert($rows);
    }

    /** @return array<int,string> */
    private function resolveActors(string $companyId, string $subjectId, $step): array
    {
        switch ($step->actor_type) {
            case 'subject':
                return [$subjectId];
            case 'user':
                return $step->actor_ref ? [(string) $step->actor_ref] : [];
            case 'manager':
                if (Schema::hasTable('team_members')) {
                    $mid = DB::table('team_members')->where('employee_id', $subjectId)->value('manager_id');
                    if ($mid) return [(string) $mid];
                }
                return [];
            case 'role':
                if (!Schema::hasTable('user_roles')) return [];
                $ids = DB::table('user_roles as ur')
                    ->join('profiles as p', 'p.user_id', '=', 'ur.user_id')
                    ->where('p.company_id', $companyId)
                    ->where('ur.role', (string) $step->actor_ref)
                    ->limit(10)->pluck('ur.user_id')->all();
                return array_map('strval', $ids);
        }
        return [];
    }

    private function taskFor(string $docId, Request $request): array
    {
        $doc = DB::table('kedo_documents')->where('id', $docId)->first();
        if (!$doc) abort(404);
        if ($doc->status !== 'in_review') {
            abort(response()->json(['ok' => false, 'message' => 'Документ не находится на подписании.'], 422));
        }
        $task = DB::table('kedo_document_participants')
            ->where('document_id', $docId)
            ->where('user_id', $this->userId($request))
            ->where('status', 'pending')
            ->where('step_order', $doc->current_step)
            ->first();
        if (!$task) {
            abort(response()->json(['ok' => false, 'message' => 'Сейчас действие от вас не требуется.'], 403));
        }
        return [$doc, $task];
    }

    private function completeTask($doc, $task, string $event, array $payload, Request $request): void
    {
        DB::table('kedo_document_participants')->where('id', $task->id)->update([
            'status' => 'done', 'acted_at' => now(),
            'comment' => (string) $request->input('comment') ?: null,
            'updated_at' => now(),
        ]);
        $this->appendEvent($doc->company_id, $doc->id, $this->userId($request), $event, $payload);
        $this->advanceDocument($doc->id);
    }

    private function advanceDocument(string $docId): void
    {
        $doc = DB::table('kedo_documents')->where('id', $docId)->first();
        if (!$doc || $doc->status !== 'in_review') return;

        $pendingOnStep = DB::table('kedo_document_participants')
            ->where('document_id', $docId)->where('step_order', $doc->current_step)
            ->where('status', 'pending')->count();
        if ($pendingOnStep > 0) return;

        $nextStep = DB::table('kedo_document_participants')
            ->where('document_id', $docId)->where('status', 'pending')
            ->orderBy('step_order')->value('step_order');

        if ($nextStep) {
            DB::table('kedo_documents')->where('id', $docId)->update([
                'current_step' => (int) $nextStep, 'updated_at' => now(),
            ]);
            $this->appendEvent($doc->company_id, $docId, null, 'step_advanced', ['step' => (int) $nextStep]);
            return;
        }

        DB::table('kedo_documents')->where('id', $docId)->update([
            'status' => 'signed', 'completed_at' => now(), 'updated_at' => now(),
        ]);
        $this->appendEvent($doc->company_id, $docId, null, 'completed', []);
    }

    private function appendEvent(?string $companyId, string $docId, ?string $actorId, string $event, array $payload): void
    {
        // Порядок в цепочке задаётся монотонным chain_index: несколько событий
        // в пределах одной секунды больше не путают проверку цепочки.
        $last = DB::table('kedo_events')->where('document_id', $docId)
            ->orderByDesc('chain_index')->orderByDesc('created_at')->orderByDesc('id')
            ->first(['hash', 'chain_index']);
        $prev = $last->hash ?? null;
        $index = $last ? ((int) $last->chain_index) + 1 : 0;
        $createdAt = now()->toDateTimeString();
        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);

        DB::table('kedo_events')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'document_id' => $docId,
            'chain_index' => $index,
            'actor_id' => $actorId,
            'event' => $event,
            'payload' => $payloadJson,
            'prev_hash' => $prev,
            'hash' => $this->chainHash($prev, $docId, $event, (string) $payloadJson, $createdAt),
            'created_at' => $createdAt,
        ]);
    }

    private function chainHash(?string $prev, string $docId, string $event, string $payload, string $createdAt): string
    {
        return hash('sha256', ($prev ?? '') . '|' . $docId . '|' . $event . '|' . $payload . '|' . $createdAt);
    }

    private function renderBody(string $body, $profile): string
    {
        $map = [
            '{{employee.full_name}}' => (string) ($profile->full_name ?? ''),
            '{{employee.position}}'  => (string) ($profile->position ?? ''),
            '{{employee.department}}'=> (string) ($profile->department ?? ''),
            '{{employee.hire_date}}' => (string) ($profile->hire_date ?? ''),
            '{{date}}'               => now()->format('d.m.Y'),
            '{{year}}'               => now()->format('Y'),
        ];
        return strtr($body, $map);
    }

    /** @return array<int,string> */
    private function extractPlaceholders(string $body): array
    {
        preg_match_all('/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/', $body, $m);
        return array_values(array_unique($m[1] ?? []));
    }

    /** @return array<string,string> user_id => full_name */
    private function namesFor(array $userIds): array
    {
        $userIds = array_values(array_unique(array_filter($userIds)));
        if (!$userIds) return [];
        $out = [];
        foreach (array_chunk($userIds, 200) as $chunk) {
            $rows = DB::table('profiles')->select('user_id', 'full_name')->whereIn('user_id', $chunk)->get();
            foreach ($rows as $r) $out[(string) $r->user_id] = (string) $r->full_name;
        }
        return $out;
    }

    private function assertTemplateVisible($row, Request $request): void
    {
        if ($row->company_id === null) return;
        if ((string) $row->company_id !== (string) $this->companyId($request)) abort(403);
    }

    private function assertDocAccess($doc, Request $request): void
    {
        $uid = $this->userId($request);
        if ((string) $doc->company_id !== (string) $this->companyId($request)) abort(403);
        if ($this->isHr($request->user())) return;
        if ((string) $doc->user_id === (string) $uid) return;
        $isParticipant = DB::table('kedo_document_participants')
            ->where('document_id', $doc->id)->where('user_id', $uid)->exists();
        if (!$isParticipant) abort(403);
    }

    /** Разовое наполнение библиотеки системных шаблонов (30+). */
    private function ensureSystemTemplates(?string $companyId, Request $request): void
    {
        $exists = DB::table('kedo_templates')->whereNull('company_id')->limit(1)->exists();
        if ($exists) return;

        $rows = [];
        foreach ($this->systemTemplates() as $tpl) {
            $body = '<h3>' . $tpl['title'] . '</h3>'
                . '<p>Сотрудник: <b>{{employee.full_name}}</b>, должность: {{employee.position}}, подразделение: {{employee.department}}.</p>'
                . '<p>' . $tpl['body'] . '</p>'
                . '<p>Дата: {{date}}</p>';
            $rows[] = [
                'id' => (string) Str::uuid(),
                'company_id' => null,
                'code' => $tpl['code'],
                'title' => $tpl['title'],
                'category' => $tpl['category'],
                'body_html' => $body,
                'placeholders' => json_encode($this->extractPlaceholders($body), JSON_UNESCAPED_UNICODE),
                'requires_signature' => true,
                'signature_kind' => $tpl['sig'] ?? 'pep',
                'retention_years' => 75,
                'is_system' => true,
                'is_active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        foreach (array_chunk($rows, 20) as $chunk) {
            DB::table('kedo_templates')->insert($chunk);
        }
    }

    /** @return array<int,array{code:string,title:string,category:string,body:string,sig?:string}> */
    private function systemTemplates(): array
    {
        $t = fn ($code, $title, $category, $body, $sig = 'pep') => compact('code', 'title', 'category', 'body', 'sig');
        return [
            $t('order_hire', 'Приказ о приёме на работу', 'hiring', 'Принять на работу с {{date}} на условиях трудового договора.', 'ukep'),
            $t('labor_contract', 'Трудовой договор', 'hiring', 'Стороны заключили трудовой договор на условиях, определённых сторонами.', 'ukep'),
            $t('labor_contract_addendum', 'Дополнительное соглашение к трудовому договору', 'hiring', 'Изложить пункты трудового договора в новой редакции.', 'ukep'),
            $t('order_transfer', 'Приказ о переводе', 'transfer', 'Перевести сотрудника на другую должность с {{date}}.', 'ukep'),
            $t('order_combination', 'Приказ о совмещении должностей', 'transfer', 'Поручить выполнение дополнительной работы в порядке совмещения.'),
            $t('order_dismissal', 'Приказ об увольнении', 'dismissal', 'Прекратить трудовой договор с {{date}}.', 'ukep'),
            $t('dismissal_statement', 'Заявление об увольнении', 'dismissal', 'Прошу уволить меня по собственному желанию с {{date}}.'),
            $t('order_vacation', 'Приказ о предоставлении отпуска', 'leave', 'Предоставить ежегодный оплачиваемый отпуск.'),
            $t('vacation_statement', 'Заявление на отпуск', 'leave', 'Прошу предоставить ежегодный оплачиваемый отпуск.'),
            $t('unpaid_leave_statement', 'Заявление на отпуск без сохранения зарплаты', 'leave', 'Прошу предоставить отпуск без сохранения заработной платы.'),
            $t('parental_leave', 'Заявление на отпуск по уходу за ребёнком', 'leave', 'Прошу предоставить отпуск по уходу за ребёнком.'),
            $t('vacation_schedule', 'График отпусков (ознакомление)', 'leave', 'С графиком отпусков ознакомлен(а).'),
            $t('order_recall_vacation', 'Приказ об отзыве из отпуска', 'leave', 'Отозвать из ежегодного оплачиваемого отпуска.'),
            $t('order_business_trip', 'Приказ о направлении в командировку', 'trip', 'Направить в служебную командировку.'),
            $t('trip_statement', 'Служебное задание на командировку', 'trip', 'Цель командировки и сроки согласованы.'),
            $t('advance_report', 'Авансовый отчёт по командировке', 'trip', 'Отчёт о расходовании подотчётных сумм.'),
            $t('order_overtime', 'Приказ о привлечении к сверхурочной работе', 'time', 'Привлечь к сверхурочной работе с письменного согласия.'),
            $t('order_weekend_work', 'Приказ о работе в выходной день', 'time', 'Привлечь к работе в выходной (нерабочий праздничный) день.'),
            $t('remote_work_agreement', 'Соглашение о дистанционной работе', 'time', 'Установить дистанционный режим работы.', 'ukep'),
            $t('schedule_change', 'Уведомление об изменении режима работы', 'time', 'Уведомляем об изменении режима рабочего времени.'),
            $t('order_bonus', 'Приказ о премировании', 'payroll', 'Выплатить премию по итогам работы.'),
            $t('order_salary_change', 'Приказ об изменении оклада', 'payroll', 'Установить должностной оклад в новом размере с {{date}}.', 'ukep'),
            $t('payslip_ack', 'Расчётный листок (ознакомление)', 'payroll', 'С расчётным листком ознакомлен(а).'),
            $t('ndfl_deduction_statement', 'Заявление на стандартный вычет НДФЛ', 'payroll', 'Прошу предоставить стандартный налоговый вычет.'),
            $t('salary_card_statement', 'Заявление о перечислении зарплаты на карту', 'payroll', 'Прошу перечислять заработную плату на указанный счёт.'),
            $t('lna_ack', 'Лист ознакомления с ЛНА', 'policy', 'С локальными нормативными актами ознакомлен(а).'),
            $t('personal_data_consent', 'Согласие на обработку персональных данных', 'policy', 'Даю согласие на обработку персональных данных.'),
            $t('nda', 'Соглашение о неразглашении (NDA)', 'policy', 'Обязуюсь не разглашать конфиденциальную информацию.', 'ukep'),
            $t('safety_briefing', 'Журнал инструктажа по охране труда', 'policy', 'Инструктаж по охране труда пройден.'),
            $t('material_liability', 'Договор о полной материальной ответственности', 'policy', 'Принимаю полную материальную ответственность за вверенное имущество.', 'ukep'),
            $t('order_disciplinary', 'Приказ о дисциплинарном взыскании', 'discipline', 'Объявить дисциплинарное взыскание.'),
            $t('explanatory_note', 'Объяснительная записка', 'discipline', 'Излагаю обстоятельства произошедшего.'),
            $t('order_probation_result', 'Приказ о результатах испытательного срока', 'discipline', 'Испытательный срок считать пройденным.'),
            $t('work_book_ack', 'Уведомление о выборе формы трудовой книжки', 'other', 'Уведомляем о праве выбора формы ведения трудовой книжки.'),
            $t('employment_certificate', 'Справка с места работы', 'other', 'Справка выдана для предъявления по месту требования.'),
            $t('order_training', 'Приказ о направлении на обучение', 'other', 'Направить на обучение по программе повышения квалификации.'),
        ];
    }

    private function assertHr(Request $request): void
    {
        if (!$this->isHr($request->user())) abort(403);
    }

    private function isHr($user): bool
    {
        if (!$user) return false;
        try {
            return $user->hasRole('hrd') || $user->hasRole('hr')
                || $user->hasRole('company_admin') || $user->hasRole('superadmin');
        } catch (\Throwable) {
            return false;
        }
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
