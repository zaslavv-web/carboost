<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * iCal-экспорт отсутствий команды.
 *
 * Публичный URL с HMAC-подписью: любой календарь (Google/Outlook/Apple)
 * может подписаться, не требуя аутентификации. Подпись привязана к company_id
 * и APP_KEY, чтобы URL нельзя было подделать.
 *
 * URL получается через /api/integrations/ical/leaves-url (для авторизованного HRD).
 */
class IcalController extends Controller
{
    public function leavesUrl(Request $request)
    {
        $user = $request->user();
        abort_unless($user, 401);
        $companyId = method_exists($user, 'companyId') ? $user->companyId() : null;
        abort_unless($companyId, 400, 'No company');

        $token = $this->sign($companyId);
        $base  = rtrim(config('app.url') ?: url('/'), '/');
        $url   = $base . "/api/ical/leaves/{$companyId}.ics?token={$token}";

        return response()->json(['url' => $url]);
    }

    public function leaves(Request $request, string $companyId)
    {
        $token = (string) $request->get('token', '');
        abort_unless(hash_equals($this->sign($companyId), $token), 403, 'Invalid token');
        abort_unless(Company::where('id', $companyId)->exists(), 404);

        if (!DB::getSchemaBuilder()->hasTable('leave_requests')) {
            return response('', 200)->header('Content-Type', 'text/calendar; charset=utf-8');
        }

        $rows = DB::table('leave_requests as lr')
            ->leftJoin('leave_types as lt', 'lt.id', '=', 'lr.leave_type_id')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'lr.user_id')
            ->where('lr.company_id', $companyId)
            ->whereIn('lr.status', ['approved', 'pending_hr'])
            ->where('lr.start_date', '>=', Carbon::now()->subMonths(3)->toDateString())
            ->where('lr.start_date', '<=', Carbon::now()->addMonths(12)->toDateString())
            ->select([
                'lr.id', 'lr.start_date', 'lr.end_date', 'lr.status', 'lr.reason',
                'lt.name as type_name',
                'p.full_name as employee_name',
            ])
            ->get();

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//GrowthPeak//Leaves//RU',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:GrowthPeak — Отсутствия команды',
        ];
        foreach ($rows as $r) {
            $start = Carbon::parse($r->start_date);
            // iCal DTEND (all-day) — эксклюзивный, +1 день к последнему дню отсутствия.
            $endExclusive = Carbon::parse($r->end_date)->addDay();
            $summary = trim(($r->employee_name ?: 'Сотрудник') . ' — ' . ($r->type_name ?: 'Отсутствие'));
            $desc = trim(($r->reason ?: '') . ' [' . $r->status . ']');
            $uid = $r->id . '@growthpeak';

            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:' . $uid;
            $lines[] = 'DTSTAMP:' . Carbon::now()->format('Ymd\THis\Z');
            $lines[] = 'DTSTART;VALUE=DATE:' . $start->format('Ymd');
            $lines[] = 'DTEND;VALUE=DATE:' . $endExclusive->format('Ymd');
            $lines[] = 'SUMMARY:' . $this->esc($summary);
            if ($desc !== '[]' && $desc !== '') {
                $lines[] = 'DESCRIPTION:' . $this->esc($desc);
            }
            $lines[] = 'STATUS:' . ($r->status === 'approved' ? 'CONFIRMED' : 'TENTATIVE');
            $lines[] = 'END:VEVENT';
        }
        $lines[] = 'END:VCALENDAR';

        return response(implode("\r\n", $lines), 200, [
            'Content-Type'        => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'inline; filename="growthpeak-leaves.ics"',
            'Cache-Control'       => 'public, max-age=300',
        ]);
    }

    private function esc(string $s): string
    {
        $s = str_replace(["\\", "\n", ",", ";"], ["\\\\", "\\n", "\\,", "\\;"], $s);
        return substr($s, 0, 500);
    }

    private function sign(string $companyId): string
    {
        return hash_hmac('sha256', 'ical:leaves:' . $companyId, (string) config('app.key'));
    }
}
