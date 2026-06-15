<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AI\AiGatewayException;
use App\Services\AI\AssessmentChatService;
use App\Services\AI\DocumentParserService;
use App\Services\AI\GenerateClosedTestService;
use App\Services\AI\GenerateDefaultTrackStepsService;
use App\Services\AI\GenerateStepScenarioService;
use App\Services\AI\HrAnalyticsAiService;
use Illuminate\Http\Request;

class AiController extends Controller
{
    public function assessmentChat(Request $request, AssessmentChatService $svc)
    {
        $messages = $request->validate([
            'messages' => 'required|array',
            'messages.*.role' => 'required|string|in:user,assistant,system,tool',
            'messages.*.content' => 'nullable',
        ])['messages'];

        try {
            $companyId = (string) ($request->input('company_id') ?: $request->user()?->company_id ?: '') ?: null;
            return $svc->stream($messages, $companyId);
        } catch (\App\Services\AI\AiDisabledException $e) {
            return response()->json(['error' => $e->getMessage(), 'disabled' => true], 423);
        } catch (AiGatewayException $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function generateClosedTest(Request $request, GenerateClosedTestService $svc)
    {
        $data = $request->validate([
            'positionTitle' => 'nullable|string|max:255',
            'competencies' => 'nullable|array',
            'competencies.*' => 'string',
        ]);
        return $this->handle(fn () => $svc->generate($data['positionTitle'] ?? 'Сотрудник', $data['competencies'] ?? []));
    }

    public function generateStepScenario(Request $request, GenerateStepScenarioService $svc)
    {
        $data = $request->validate([
            'template_id' => 'nullable|string',
            'step_order' => 'required|integer|min:0',
            'step_title' => 'nullable|string',
            'goals' => 'nullable|array',
            'pass_conditions' => 'nullable|array',
            'success_metrics' => 'nullable|array',
            'generate_test' => 'nullable|boolean',
        ]);
        return $this->handle(fn () => $svc->generate($data));
    }

    public function generateDefaultTrackSteps(Request $request, GenerateDefaultTrackStepsService $svc)
    {
        $data = $request->validate([
            'months' => 'required|integer|min:1|max:60',
            'positionTitle' => 'nullable|string|max:255',
            'goals' => 'nullable|array',
        ]);
        return $this->handle(fn () => $svc->generate(
            $data['months'], $data['positionTitle'] ?? null, $data['goals'] ?? [],
        ));
    }

    public function generateCareerPaths(Request $request, HrAnalyticsAiService $svc)
    {
        $data = $request->validate([
            'positions' => 'required|array|min:1',
            'departments' => 'nullable|array',
        ]);
        return $this->handle(fn () => $svc->generateCareerPaths($data['positions'], $data['departments'] ?? []));
    }

    public function generatePositionsFromOrg(Request $request, HrAnalyticsAiService $svc)
    {
        $data = $request->validate(['departments' => 'required|array|min:1']);
        return $this->handle(fn () => $svc->generatePositionsFromOrg($data['departments']));
    }

    public function generateQuestionnaireProfile(Request $request, HrAnalyticsAiService $svc)
    {
        $data = $request->validate([
            'answers' => 'required|array',
            'skillGaps' => 'nullable|array',
            'positionTitle' => 'nullable|string|max:160',
        ]);
        return $this->handle(fn () => $svc->generateQuestionnaireProfile(
            $data['answers'], $data['skillGaps'] ?? [], $data['positionTitle'] ?? '',
        ));
    }

    public function suggestTicketFix(Request $request, HrAnalyticsAiService $svc)
    {
        $data = $request->validate([
            'subject' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);
        return $this->handle(fn () => $svc->suggestTicketFix($data['subject'], $data['description'] ?? null));
    }

    public function parsePositionStandards(Request $request, DocumentParserService $svc)
    {
        $data = $request->validate(['fileUrl' => 'required|url', 'fileName' => 'required|string']);
        return $this->handle(fn () => $svc->parsePositionStandards($data['fileUrl'], $data['fileName']));
    }

    public function parseHrDocument(Request $request, DocumentParserService $svc)
    {
        $data = $request->validate([
            'fileUrl' => 'required|url', 'fileName' => 'required|string',
            'documentType' => 'nullable|string|max:64',
        ]);
        return $this->handle(fn () => $svc->parseHrDocument($data['fileUrl'], $data['fileName'], $data['documentType'] ?? 'general'));
    }

    public function parseOrgStructure(Request $request, DocumentParserService $svc)
    {
        $data = $request->validate(['fileUrl' => 'required|url', 'fileName' => 'required|string']);
        return $this->handle(fn () => $svc->parseOrgStructure($data['fileUrl'], $data['fileName']));
    }

    public function parseTestDocument(Request $request, DocumentParserService $svc)
    {
        $data = $request->validate(['fileUrl' => 'required|url', 'fileName' => 'required|string']);
        return $this->handle(fn () => $svc->parseTestDocument($data['fileUrl'], $data['fileName']));
    }

    private function handle(\Closure $fn)
    {
        try {
            return response()->json($fn());
        } catch (\App\Services\AI\AiDisabledException $e) {
            return response()->json(['error' => $e->getMessage(), 'disabled' => true], 423);
        } catch (AiGatewayException $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        } catch (\Throwable $e) {
            report($e);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
