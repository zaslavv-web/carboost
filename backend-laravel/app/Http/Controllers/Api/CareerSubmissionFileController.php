<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CareerStepSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CareerSubmissionFileController extends Controller
{
    public function index(Request $request)
    {
        $ids = array_values(array_unique(array_filter((array) $request->input('submission_ids', []))));
        if (! $ids) return response()->json(['data' => []]);
        if (count($ids) > 500) return response()->json(['error' => 'Слишком много заявок'], 422);

        $allowed = CareerStepSubmission::query()->whereIn('id', $ids)->get()
            ->filter(fn ($submission) => $request->user()?->can('view', $submission))
            ->pluck('id')->all();

        return response()->json(['data' => DB::table('career_step_submission_files')
            ->whereIn('submission_id', $allowed)->orderBy('uploaded_at')->get()]);
    }
}