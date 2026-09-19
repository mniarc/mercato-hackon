---
id: AC4
story: F20-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Krok przekazania nie tworzy planu i nie żąda nowej decyzji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningReadiness/read.ts` — Read-only readiness generates no plan and requests no extra client approval.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. The separate planning producer followed readiness without an extra client decision. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
