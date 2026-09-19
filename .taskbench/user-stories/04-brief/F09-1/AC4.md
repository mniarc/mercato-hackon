---
id: AC4
story: F09-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Opcjonalny cel z zakupu jest wykorzystany jako dane wejściowe, a nie domniemana akceptacja całego briefu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/brief.ts` — Purchase goal is writer context, not document acceptance.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: order goal used as input only; no acceptance inferred (status draft/ready_for_review) - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
