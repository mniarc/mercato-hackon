---
id: AC1
story: F12-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przekazanie odwołuje się do zapisu akceptacji 4.6, zaakceptowanego KLI-BRIEF, aktualnego pakietu 3.8 i STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyReadiness/resolve.ts` — Readiness pins typed acceptance, accepted brief, latest successful freeze/QA and process reference.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Strategy consumed the accepted revised brief and refreshed actual QA/freeze foundation. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
