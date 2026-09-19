---
id: AC1
story: F26-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Gotowość z 5.8 aktywuje zadania planowania, jakości, akceptacji i wyboru jednego tematu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/workflow.ts` — Accepted pair and readiness activate native planning, QA and subsequent plan/topic invitation.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Accepted-pair readiness invoked real planning/QA and created the client plan invitation. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
