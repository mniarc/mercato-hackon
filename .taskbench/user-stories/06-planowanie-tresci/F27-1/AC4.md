---
id: AC4
story: F27-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Wewnętrzne braki tworzą zadanie poprawy w 6.2; wyłącznie pozytywny wynik przekazuje tę wersję do 6.4.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningExecution/run.ts` — 6.3 internal failures rerun 6.2 within limits; only actual ready result reaches review, exhausted result routes E.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the QA-gated WZR-PLAN reached the native client review with actual offered topics; in one authenticated interaction the client approved that exact plan and selected the actually offered TOP02, which passed current-plan/QA validation.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live to_fix created a 6.2 repair (6.2 attempt 3); only the done verdict handed the version on - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | passed |
