# HRD Simulation Report
Run: 2026-07-05T22:05:15.442Z
Target: https://growth-peak.pro · Account: hrd.01@demo.pikrosta.ru · Company: ffe74c95-d78d-45c0-9511-8db3c643813c

## Summary
- Total findings: **15**
- critical: 5
- high: 3
- medium: 7

## Findings

| # | Sev | Scenario | Step | Endpoint | Expected | Actual | Summary |
|---|-----|----------|------|----------|----------|--------|---------|
| 1 | critical | A | create position | `POST /api/positions` | 200/201/204 | 500 | unexpected 500 |
| 2 | medium | A | AI generate positions | `POST /api/ai/generate-positions-from-org` | 200/201/202/400/402/423/429/503 | 403 | unexpected 403 |
| 3 | high | B | prereq | `-` |  |  | no positions from scenario A → skipping most of B |
| 4 | critical | C | create assessment scenario | `POST /api/assessment-scenarios` | 200/201/204 | 500 | unexpected 500 |
| 5 | medium | C | AI assessment chat | `POST /api/ai/assessment-chat` | 200/201/202/400/402/429/503 | 403 | unexpected 403 |
| 6 | high | C | list hr_tasks | `GET /api/db/hr_tasks` | 200/201/204 | 404 | unexpected 404 |
| 7 | high | C | create hr_task | `POST /api/db/hr_tasks` | 200/201/204 | 404 | unexpected 404 |
| 8 | critical | D | hiring | `GET /api/people-analytics/hiring` | 200/201/204 | 500 | unexpected 500 |
| 9 | critical | D | absence | `GET /api/people-analytics/absence` | 200/201/204 | 500 | unexpected 500 |
| 10 | critical | D | risk | `GET /api/people-analytics/risk` | 200/201/204 | 500 | unexpected 500 |
| 11 | medium | D | risks/recompute | `POST /api/risks/recompute` | 200/201/202/400/429 | 422 | unexpected 422 |
| 12 | medium | D | comfort company | `GET /api/comfort/company` | 200/201/204 | 422 | unexpected 422 |
| 13 | medium | D | comfort recompute | `POST /api/comfort/recompute` | 200/201/202/400/429 | 422 | unexpected 422 |
| 14 | medium | C | cleanup | `DELETE /api/db/individual_development_plans?id=a2306f6b-0b44-4f2a-acd4-1d92ac9de2ef` | 200/201/202/204/404 | 422 | unexpected 422 |
| 15 | medium | A | cleanup | `DELETE /api/competencies/a2306f69-d014-4077-a8a8-657d6773c768` | 200/201/202/204/404 | 403 | unexpected 403 |

Full request log: [docs/hrd-sim/run.log](hrd-sim/run.log)