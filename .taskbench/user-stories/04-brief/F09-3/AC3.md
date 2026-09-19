---
id: AC3
story: F09-3
status: implemented
blocking: false
needs_decision: false
needs_trial: false
needs_code: false
---

# AC3

## Criterion

Brak informacji wymagającej decyzji klienta jest opisany konkretnym pytaniem kierowanym przez 4.3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/briefReviewHandoff.ts` — Question-bearing brief invitation permits responses but not approval until QA ready.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the initial exact brief was needs_client_data with genuine questions and acceptance disabled; the authenticated client answered in the native UI, a different version became ready_for_approval, and that exact version was explicitly accepted without another checkout. Local intelligence fixture, not live-model proof.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live needs_client_data verdicts reclassified client gaps into concrete questions handed to review - live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | passed |
