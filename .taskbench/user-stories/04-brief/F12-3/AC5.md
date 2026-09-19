---
id: AC5
story: F12-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Krok 4.7 przekazuje gotowość; nie generuje strategii i nie wymaga kolejnej akcji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyReadiness/resolve.ts` — Readiness is read-only; native following step separately starts strategy under configured policy.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Readiness handed off to the separate strategy producer without another customer action. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
