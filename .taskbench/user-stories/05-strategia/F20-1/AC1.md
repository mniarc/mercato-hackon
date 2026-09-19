---
id: AC1
story: F20-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Po gotowości z 4.7 powstają zadania strategii, tone of voice i jakości określone w przypisanej wersji STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Scoped activation pins accepted brief, frozen analysis, configured process and producer tasks 5.2–5.4.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Accepted-brief readiness invoked native strategy, tone-of-voice and paired-QA production. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
