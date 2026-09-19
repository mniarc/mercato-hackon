---
id: AC5
story: F07-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Audyt jest wejściem do porównania i briefu; nie wymaga osobnej akceptacji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/researchService.ts` — Research chain uses audit as comparison/brief input without customer acceptance.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live 3.3 output was consumed by 3.5 and 4.1 without a client acceptance (handoffs research-sources-to-audit / research-audit-to-findings observed) - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
