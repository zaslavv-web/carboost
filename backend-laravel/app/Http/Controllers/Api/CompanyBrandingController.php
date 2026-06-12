<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

/**
 * Брендинг компании (логотип + фирменные цвета).
 *
 * Чтение: любой авторизованный пользователь своей компании, либо superadmin.
 * Запись: hrd / company_admin / superadmin.
 */
class CompanyBrandingController extends Controller
{
    public function show(string $companyId): JsonResponse
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['error' => 'unauthenticated'], 401);
        }
        if (!$this->canRead($companyId)) {
            return response()->json(['error' => 'forbidden'], 403);
        }
        $row = $this->fetch($companyId);
        return response()->json($row);
    }

    public function update(Request $request, string $companyId): JsonResponse
    {
        if (!$this->canWrite($companyId)) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $data = $request->all();
        $validator = Validator::make($data, [
            'logo_url'         => ['nullable', 'string', 'max:1500000'],
            'logo_dark_url'    => ['nullable', 'string', 'max:1500000'],
            'primary_hsl'      => ['nullable', 'string', 'max:32'],
            'primary_glow_hsl' => ['nullable', 'string', 'max:32'],
            'accent_hsl'       => ['nullable', 'string', 'max:32'],
            'sidebar_bg_hsl'   => ['nullable', 'string', 'max:32'],
            'auto_extracted'   => ['nullable', 'boolean'],
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }
        $valid = $validator->validated();

        foreach (['primary_hsl', 'primary_glow_hsl', 'accent_hsl', 'sidebar_bg_hsl'] as $k) {
            if (array_key_exists($k, $valid) && $valid[$k] !== null && !$this->isValidHsl($valid[$k])) {
                return response()->json([
                    'errors' => [$k => ['Неверный формат HSL. Ожидается «H S% L%», например «46 65% 52%».']],
                ], 422);
            }
        }

        $payload = array_merge(['company_id' => $companyId], $valid, [
            'updated_by' => auth()->user()->id ?? null,
            'updated_at' => now(),
        ]);

        if (!Schema::hasTable('company_branding')) {
            return response()->json(['error' => 'company_branding table missing — run migrations'], 500);
        }

        $exists = DB::table('company_branding')->where('company_id', $companyId)->exists();
        if ($exists) {
            DB::table('company_branding')->where('company_id', $companyId)->update($payload);
        } else {
            $payload['created_at'] = now();
            DB::table('company_branding')->insert($payload);
        }

        return response()->json($this->fetch($companyId));
    }

    public function destroy(string $companyId): JsonResponse
    {
        if (!$this->canWrite($companyId)) {
            return response()->json(['error' => 'forbidden'], 403);
        }
        if (Schema::hasTable('company_branding')) {
            DB::table('company_branding')->where('company_id', $companyId)->delete();
        }
        return response()->json(['company_id' => $companyId]);
    }

    private function fetch(string $companyId): array
    {
        if (!Schema::hasTable('company_branding')) {
            return $this->emptyBranding($companyId);
        }
        $row = DB::table('company_branding')->where('company_id', $companyId)->first();
        if (!$row) {
            // Lazy backfill: подтягиваем logo_url из companies, если есть.
            $legacyLogo = DB::table('companies')->where('id', $companyId)->value('logo_url');
            return array_merge($this->emptyBranding($companyId), [
                'logo_url' => $legacyLogo ?: null,
            ]);
        }
        return (array) $row;
    }

    private function emptyBranding(string $companyId): array
    {
        return [
            'company_id'       => $companyId,
            'logo_url'         => null,
            'logo_dark_url'    => null,
            'primary_hsl'      => null,
            'primary_glow_hsl' => null,
            'accent_hsl'       => null,
            'sidebar_bg_hsl'   => null,
            'auto_extracted'   => false,
            'updated_by'       => null,
            'created_at'       => null,
            'updated_at'       => null,
        ];
    }

    private function canRead(string $companyId): bool
    {
        $user = auth()->user();
        if (!$user) return false;
        if ($this->hasRole($user, ['superadmin'])) return true;
        $myCompany = $this->companyId($user);
        return $myCompany && $myCompany === $companyId;
    }

    private function canWrite(string $companyId): bool
    {
        $user = auth()->user();
        if (!$user) return false;
        if ($this->hasRole($user, ['superadmin'])) return true;
        if (!$this->hasRole($user, ['hrd', 'company_admin'])) return false;
        $myCompany = $this->companyId($user);
        return $myCompany && $myCompany === $companyId;
    }

    private function hasRole($user, array $roles): bool
    {
        $userId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        return DB::table('user_roles')
            ->where('user_id', $userId)
            ->whereIn('role', $roles)
            ->exists();
    }

    private function companyId($user): ?string
    {
        $userId = method_exists($user, 'domainUserId') ? $user->domainUserId() : $user->id;
        return DB::table('profiles')->where('user_id', $userId)->value('company_id');
    }

    private function isValidHsl(string $value): bool
    {
        // Ожидается строка вида "46 65% 52%"
        return (bool) preg_match('/^\s*\d{1,3}\s+\d{1,3}%\s+\d{1,3}%\s*$/', $value);
    }
}
