---
id: AC2
story: F12-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Orkiestrator sprawdza aktualność zaakceptowanej wersji przed przekazaniem do 5.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyReadiness/resolve.ts` — Checks exact current brief and all frozen analysis current pointers before5.1.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Current accepted brief passed the native strategy-readiness handoff. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
