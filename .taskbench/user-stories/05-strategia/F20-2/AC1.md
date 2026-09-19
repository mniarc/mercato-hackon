---
id: AC1
story: F20-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przekazanie wskazuje zaakceptowane wersje briefu, strategii i TOV oraz zapis decyzji 5.7.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningReadiness/read.ts` — Readiness resolves typed cumulative strategy/ToV acceptance and exact approved brief/version foundations.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Planning consumed the genuinely accepted exact brief/strategy/ToV versions. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
