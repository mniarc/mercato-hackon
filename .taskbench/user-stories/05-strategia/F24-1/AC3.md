---
id: AC3
story: F24-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Każda odpowiedź jest przekazywana do G.1; lokalny agent nie klasyfikuje ponownie zakresu ani wpływu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Native completed task stores original response then submits once to shared G.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. The original paired approval passed through native G. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
